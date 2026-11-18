import net from "node:net";

/**
 * Intermediário de mentira entre o painel e o Postgres que imita o defeito do pooler do Supabase
 * (Supavisor antes da 2.10, porta 6543): se o cliente mandar uma consulta nova antes de a anterior
 * terminar na mesma conexão ("pipeline"), ele para de responder naquela conexão, para sempre.
 *
 * mode "silent": responde ao login e depois nunca mais responde nada (banco/rede mudos).
 */
export async function startFaultyPooler(targetPort: number, mode: "pipeline-bug" | "silent" = "pipeline-bug") {
  let wedged = 0;
  const sockets = new Set<net.Socket>();

  const server = net.createServer((client) => {
    const upstream = net.connect(targetPort, "127.0.0.1");
    sockets.add(client).add(upstream);
    let started = false; // a primeira mensagem do cliente (login) não tem byte de tipo
    let ready = false; // só conta consultas depois do primeiro "pronto" (Z) do servidor
    let outstanding = 0; // consultas enviadas que ainda não terminaram
    let stuck = false;
    let fromClient = Buffer.alloc(0);
    let fromServer = Buffer.alloc(0);

    client.on("data", (chunk) => {
      fromClient = Buffer.concat([fromClient, chunk]);
      for (;;) {
        if (!started) {
          if (fromClient.length < 4) return;
          const len = fromClient.readInt32BE(0);
          if (fromClient.length < len) return;
          const msg = fromClient.subarray(0, len);
          fromClient = fromClient.subarray(len);
          started = true;
          upstream.write(msg);
          continue;
        }
        if (fromClient.length < 5) return;
        const type = String.fromCharCode(fromClient[0]);
        const len = fromClient.readInt32BE(1) + 1;
        if (fromClient.length < len) return;
        const msg = fromClient.subarray(0, len);
        fromClient = fromClient.subarray(len);
        if (ready && (type === "P" || type === "Q") && outstanding > 0 && !stuck) {
          stuck = true;
          wedged++;
        }
        if (stuck) continue; // engole tudo: o cliente fica esperando para sempre
        if (ready && (type === "S" || type === "Q")) outstanding++;
        upstream.write(msg);
      }
    });

    upstream.on("data", (chunk) => {
      fromServer = Buffer.concat([fromServer, chunk]);
      for (;;) {
        if (fromServer.length < 5) return;
        const type = String.fromCharCode(fromServer[0]);
        const len = fromServer.readInt32BE(1) + 1;
        if (fromServer.length < len) return;
        const msg = fromServer.subarray(0, len);
        fromServer = fromServer.subarray(len);
        if (stuck) continue;
        if (type === "Z") {
          if (!ready) {
            ready = true;
            client.write(msg);
            if (mode === "silent") stuck = true;
            continue;
          }
          outstanding = Math.max(0, outstanding - 1);
        }
        client.write(msg);
      }
    });

    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on("error", close).on("close", close);
    upstream.on("error", close).on("close", close);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port,
    /** Quantas conexões travaram por causa de consulta encavalada. */
    wedgedConnections: () => wedged,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy();
        server.close(() => resolve());
      }),
  };
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { regenerateKeyAction, regenerateReportLinkAction, setActiveAction } from "@/app/actions";
import { ClientForm } from "@/components/ClientForm";
import { CopyButton } from "@/components/CopyButton";
import { CsvImportForm } from "@/components/CsvImportForm";
import { getDb } from "@/db";
import { buildAdsScript } from "@/lib/ads-script";
import { requireUser } from "@/lib/auth/session";
import { baseUrl, isLocalUrl } from "@/lib/base-url";
import { getClient } from "@/lib/clients";
import { hashKey } from "@/lib/keys";

export const metadata: Metadata = { title: "Configuração do cliente" };

export default async function ClientConfigPage(props: PageProps<"/clientes/[id]/config">) {
  const user = await requireUser();
  const { id } = await props.params;
  const db = await getDb();
  const client = await getClient(db, user.workspaceId, id);
  if (!client) notFound();

  const url = await baseUrl();
  const local = isLocalUrl(url);
  // A chave só existe aqui logo depois de criada; no banco fica apenas o hash.
  const flashed = (await cookies()).get(`ps_key_${client.id}`)?.value;
  const freshKey = flashed && hashKey(flashed) === client.ingestKeyHash ? flashed : null;
  const script = buildAdsScript({
    endpoint: `${url}/api/ingest`,
    key: freshKey ?? "COLE_A_CHAVE_AQUI",
    clientName: client.name,
  });
  const reportUrl = `${url}/r/${client.reportToken}`;

  return (
    <>
      <nav className="text-sm text-ink-2" aria-label="Você está em">
        <Link href="/" className="underline underline-offset-2">Visão geral</Link> /{" "}
        <Link href={`/clientes/${client.id}`} className="underline underline-offset-2">{client.name}</Link> / Configuração
      </nav>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Configuração</h1>

      <div className="mt-8 space-y-12">
        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Dados do cliente</h2>
          <ClientForm client={client} />
        </section>

        <section id="envio" className="scroll-mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Envio diário pelo Google Ads</h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
            Cole este script na conta do Google Ads do cliente. Ele roda uma vez por dia, lê os números das campanhas e envia para o painel.
            Ele só lê dados: não altera campanhas, lances nem orçamentos.
          </p>

          {local && (
            <p className="mt-4 max-w-[70ch] rounded-md border border-warning bg-warning/10 px-4 py-3 text-sm leading-relaxed">
              <strong>O painel está rodando só neste computador.</strong> O Google não consegue enviar dados para <span className="num">{url}</span>.
              Publique o painel (veja o LEIA-ME) e abra esta tela pelo endereço publicado para pegar o script certo. Até lá, use a importação de CSV abaixo.
            </p>
          )}

          {freshKey ? (
            <div className="mt-4 max-w-[70ch] rounded-md border border-line-strong bg-surface px-4 py-3 text-sm leading-relaxed">
              <strong>Chave nova criada.</strong> Ela já está dentro do script abaixo e não será mostrada de novo depois que você sair desta tela.
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <code className="num rounded bg-canvas px-2 py-1 text-[13px] break-all">{freshKey}</code>
                <CopyButton text={freshKey} label="Copiar chave" />
              </div>
            </div>
          ) : (
            <p className="mt-4 max-w-[70ch] text-sm leading-relaxed">
              Chave atual: <code className="num rounded bg-canvas px-1.5 py-0.5 text-[13px]">{client.ingestKeyHint}</code>. Por segurança o painel não guarda a chave inteira.
              Se você não tem mais o script instalado, gere uma chave nova: a antiga para de funcionar na hora.
            </p>
          )}

          <div className="mt-4 overflow-hidden rounded-lg border border-line-strong">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
              <span className="text-sm font-medium">Script para o Google Ads</span>
              <CopyButton text={script} label="Copiar script" className="btn btn-primary" />
            </div>
            <pre className="max-h-80 overflow-auto bg-[#101010] p-4 text-[12.5px] leading-relaxed text-white/90"><code>{script}</code></pre>
          </div>
          <ol className="mt-4 max-w-[70ch] list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
            <li>No Google Ads do cliente, abra Ferramentas, depois Ações em massa, depois Scripts, e clique em “+”.</li>
            <li>Apague o que estiver lá, cole o script e clique em Autorizar.</li>
            <li>Clique em Executar uma vez. Nos registros deve aparecer “Painel respondeu 200”.</li>
            <li>Salve e mude a frequência para Diariamente (sugestão: 6h da manhã).</li>
          </ol>
          <form action={regenerateKeyAction} className="mt-5">
            <input type="hidden" name="id" value={client.id} />
            <button type="submit" className="btn btn-quiet">Gerar chave nova</button>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">Importar relatório em CSV</h2>
          <p className="mt-1 mb-4 max-w-[70ch] text-sm leading-relaxed text-ink-2">
            Para trazer histórico antigo ou alimentar um cliente sem script. No Google Ads, abra Campanhas, segmente por Tempo e Dia, e baixe em CSV.
            O arquivo precisa das colunas Dia e Campanha; o painel lê também Impr., Cliques, Custo e Conversões. Os dias que vierem no arquivo substituem o que já existia desses dias.
          </p>
          <div className="max-w-lg"><CsvImportForm clientId={client.id} /></div>
        </section>

        <section id="relatorio" className="scroll-mt-6">
          <h2 className="text-lg font-semibold tracking-tight">Link do relatório</h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
            Quem tiver este link vê os relatórios mensais deste cliente, sem login. Envie só para o cliente.
            Se o link vazar, gere um novo: o antigo deixa de abrir.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="num rounded bg-surface px-3 py-2 text-[13px] break-all ring-1 ring-line-strong">{reportUrl}</code>
            <CopyButton text={reportUrl} label="Copiar link" />
            <form action={regenerateReportLinkAction}>
              <input type="hidden" name="id" value={client.id} />
              <button type="submit" className="btn btn-quiet">Gerar link novo</button>
            </form>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight">{client.active ? "Arquivar cliente" : "Cliente arquivado"}</h2>
          <p className="mt-1 max-w-[70ch] text-sm leading-relaxed text-ink-2">
            {client.active
              ? "O cliente sai da visão geral e dos alertas, e o script dele passa a ser recusado. O histórico fica guardado e você pode reativar depois."
              : "Este cliente está fora da visão geral e não recebe dados."}
          </p>
          <form action={setActiveAction} className="mt-3">
            <input type="hidden" name="id" value={client.id} />
            <input type="hidden" name="active" value={client.active ? "0" : "1"} />
            <button type="submit" className="btn btn-quiet">{client.active ? "Arquivar cliente" : "Reativar cliente"}</button>
          </form>
        </section>
      </div>
    </>
  );
}

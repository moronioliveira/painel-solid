/** Monta o script que o gestor cola no Google Ads de cada cliente. */
export function buildAdsScript(opts: { endpoint: string; key: string; clientName: string }): string {
  const name = opts.clientName.replace(/[\r\n*/\\]/g, " ").slice(0, 80);
  return `/**
 * Painel Solid: envio diário de dados
 * Cliente: ${name}
 *
 * Como instalar:
 * 1. No Google Ads do cliente: Ferramentas > Ações em massa > Scripts > botão "+".
 * 2. Apague o conteúdo, cole este script inteiro e clique em "Autorizar".
 * 3. Clique em "Executar" uma vez e confira nos registros a linha "Painel respondeu 200".
 * 4. Salve e, na lista de scripts, mude a frequência para "Diariamente" (sugestão: 6h).
 *
 * O script só lê dados da conta. Ele não altera campanhas, lances nem orçamentos.
 */

var ENDPOINT = ${JSON.stringify(opts.endpoint)};
var CHAVE = ${JSON.stringify(opts.key)};
var DIAS = 30; // reenvia os últimos 30 dias porque o Google corrige conversões com atraso

function main() {
  var conta = AdsApp.currentAccount();
  var fuso = conta.getTimeZone();
  var agora = new Date();
  var de = formatar(diasAtras(agora, DIAS), fuso);
  var ate = formatar(diasAtras(agora, 1), fuso);

  var linhas = [];
  var consulta = AdsApp.search(
    "SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks, " +
    "metrics.cost_micros, metrics.conversions, metrics.conversions_value " +
    "FROM campaign WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "'"
  );
  while (consulta.hasNext()) {
    var r = consulta.next();
    linhas.push({
      date: r.segments.date,
      campaignId: String(r.campaign.id),
      campaignName: r.campaign.name,
      impressions: Number(r.metrics.impressions) || 0,
      clicks: Number(r.metrics.clicks) || 0,
      costMicros: Number(r.metrics.costMicros) || 0,
      conversions: Number(r.metrics.conversions) || 0,
      conversionsValue: Number(r.metrics.conversionsValue) || 0
    });
  }

  var campanhas = [];
  var lista = AdsApp.search(
    "SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status != 'REMOVED'"
  );
  while (lista.hasNext()) {
    var c = lista.next();
    campanhas.push({ id: String(c.campaign.id), name: c.campaign.name, status: String(c.campaign.status) });
  }

  var resposta = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHAVE },
    payload: JSON.stringify({
      customerId: conta.getCustomerId(),
      from: de,
      to: ate,
      rows: linhas,
      campaigns: campanhas
    }),
    muteHttpExceptions: true
  });

  var codigo = resposta.getResponseCode();
  Logger.log('Período ' + de + ' a ' + ate + ': ' + linhas.length + ' linhas, ' + campanhas.length + ' campanhas.');
  Logger.log('Painel respondeu ' + codigo + ': ' + resposta.getContentText());
  if (codigo !== 200) {
    // O erro faz o Google Ads avisar por e-mail que o script falhou.
    throw new Error('O painel recusou o envio (' + codigo + '): ' + resposta.getContentText());
  }
}

function diasAtras(data, n) {
  return new Date(data.getTime() - n * 24 * 60 * 60 * 1000);
}

function formatar(data, fuso) {
  return Utilities.formatDate(data, fuso, 'yyyy-MM-dd');
}
`;
}

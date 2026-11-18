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

  // Dados extras. Cada parte é protegida: se uma falhar, o resto do envio continua.
  var erros = [];
  var extras = {};

  tentar('alcance', erros, function () {
    var porChave = {};
    for (var i = 0; i < linhas.length; i++) porChave[linhas[i].date + '|' + linhas[i].campaignId] = linhas[i];
    var q = AdsApp.search(
      "SELECT campaign.id, segments.date, metrics.search_impression_share, " +
      "metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share " +
      "FROM campaign WHERE campaign.advertising_channel_type = 'SEARCH' " +
      "AND segments.date BETWEEN '" + de + "' AND '" + ate + "'"
    );
    while (q.hasNext()) {
      var r = q.next();
      var linha = porChave[r.segments.date + '|' + String(r.campaign.id)];
      if (!linha) continue;
      linha.impressionShare = parcela(r.metrics.searchImpressionShare);
      linha.lostBudgetShare = parcela(r.metrics.searchBudgetLostImpressionShare);
      linha.lostRankShare = parcela(r.metrics.searchRankLostImpressionShare);
    }
  });

  tentar('termos de pesquisa', erros, function () {
    var termos = [];
    var q = AdsApp.search(
      "SELECT search_term_view.search_term, campaign.id, segments.date, metrics.impressions, " +
      "metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view " +
      "WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "' AND metrics.clicks > 0"
    );
    while (q.hasNext() && termos.length < 20000) {
      var r = q.next();
      termos.push({
        date: r.segments.date,
        campaignId: String(r.campaign.id),
        term: r.searchTermView.searchTerm,
        impressions: Number(r.metrics.impressions) || 0,
        clicks: Number(r.metrics.clicks) || 0,
        costMicros: Number(r.metrics.costMicros) || 0,
        conversions: Number(r.metrics.conversions) || 0
      });
    }
    extras.searchTerms = termos;
  });

  tentar('palavras-chave', erros, function () {
    var palavras = [];
    var q = AdsApp.search(
      "SELECT ad_group.id, ad_group_criterion.criterion_id, campaign.name, " +
      "ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, " +
      "ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score, " +
      "ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr, " +
      "metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view " +
      "WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "' " +
      "AND ad_group_criterion.status != 'REMOVED' AND campaign.status != 'REMOVED'"
    );
    while (q.hasNext() && palavras.length < 20000) {
      var r = q.next();
      var crit = r.adGroupCriterion || {};
      var qi = crit.qualityInfo || {};
      var kw = crit.keyword || {};
      palavras.push({
        id: String(r.adGroup.id) + '~' + String(crit.criterionId),
        campaignName: r.campaign.name,
        text: kw.text || '',
        matchType: String(kw.matchType || ''),
        qualityScore: qi.qualityScore ? Number(qi.qualityScore) : null,
        adRelevance: qi.creativeQualityScore ? String(qi.creativeQualityScore) : null,
        landingPage: qi.postClickQualityScore ? String(qi.postClickQualityScore) : null,
        expectedCtr: qi.searchPredictedCtr ? String(qi.searchPredictedCtr) : null,
        impressions: Number(r.metrics.impressions) || 0,
        clicks: Number(r.metrics.clicks) || 0,
        costMicros: Number(r.metrics.costMicros) || 0,
        conversions: Number(r.metrics.conversions) || 0
      });
    }
    extras.keywords = palavras;
  });

  tentar('ações de conversão', erros, function () {
    var acoes = {};
    var q = AdsApp.search(
      "SELECT conversion_action.id, conversion_action.name, conversion_action.status, " +
      "conversion_action.category, conversion_action.primary_for_goal FROM conversion_action"
    );
    while (q.hasNext()) {
      var r = q.next();
      var a = r.conversionAction;
      acoes[String(a.id)] = {
        id: String(a.id),
        name: a.name,
        status: String(a.status),
        category: String(a.category || ''),
        primary: a.primaryForGoal === true || a.primaryForGoal === 'true',
        conversions30d: 0,
        lastConversionDate: null
      };
    }
    var c = AdsApp.search(
      "SELECT segments.conversion_action, segments.date, metrics.all_conversions FROM campaign " +
      "WHERE segments.date BETWEEN '" + de + "' AND '" + ate + "' AND metrics.all_conversions > 0"
    );
    while (c.hasNext()) {
      var r2 = c.next();
      var id = String(r2.segments.conversionAction).split('/').pop();
      var acao = acoes[id];
      if (!acao) continue;
      acao.conversions30d += Number(r2.metrics.allConversions) || 0;
      if (!acao.lastConversionDate || r2.segments.date > acao.lastConversionDate) acao.lastConversionDate = r2.segments.date;
    }
    var listaAcoes = [];
    for (var k in acoes) listaAcoes.push(acoes[k]);
    extras.conversionActions = listaAcoes;
  });

  var envio = {
    customerId: conta.getCustomerId(),
    from: de,
    to: ate,
    rows: linhas,
    campaigns: campanhas,
    extrasErrors: erros
  };
  for (var campo in extras) envio[campo] = extras[campo];

  var resposta = UrlFetchApp.fetch(ENDPOINT, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + CHAVE },
    payload: JSON.stringify(envio),
    muteHttpExceptions: true
  });

  var codigo = resposta.getResponseCode();
  Logger.log('Período ' + de + ' a ' + ate + ': ' + linhas.length + ' linhas, ' + campanhas.length + ' campanhas, ' +
    (extras.searchTerms ? extras.searchTerms.length : 0) + ' termos de pesquisa, ' +
    (extras.keywords ? extras.keywords.length : 0) + ' palavras-chave, ' +
    (extras.conversionActions ? extras.conversionActions.length : 0) + ' ações de conversão.');
  for (var e = 0; e < erros.length; e++) Logger.log('Aviso: ' + erros[e]);
  Logger.log('Painel respondeu ' + codigo + ': ' + resposta.getContentText());
  if (codigo !== 200) {
    // O erro faz o Google Ads avisar por e-mail que o script falhou.
    throw new Error('O painel recusou o envio (' + codigo + '): ' + resposta.getContentText());
  }
}

function tentar(nome, erros, fn) {
  try {
    fn();
  } catch (err) {
    erros.push(nome + ': ' + String(err && err.message ? err.message : err).slice(0, 400));
  }
}

/** Parcela de 0 a 1. O Google às vezes devolve texto ou valores fora da faixa quando não há dado. */
function parcela(v) {
  var n = Number(v);
  if (v === undefined || v === null || v === '' || isNaN(n) || n < 0 || n > 1) return null;
  return n;
}

function diasAtras(data, n) {
  return new Date(data.getTime() - n * 24 * 60 * 60 * 1000);
}

function formatar(data, fuso) {
  return Utilities.formatDate(data, fuso, 'yyyy-MM-dd');
}
`;
}

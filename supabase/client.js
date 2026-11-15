/* Ligação anónima de leitura: sem sessão persistente nem operações de escrita. */
'use strict';
window.PoyCloud = (() => {
  const config = window.POY_SUPABASE_CONFIG;
  let client;
  function connection() {
    if (!config?.url || !config?.publishableKey || !window.supabase?.createClient) {
      throw new Error('Não foi possível carregar a ligação online. Verifique a Internet e volte a tentar.');
    }
    client ||= window.supabase.createClient(config.url, config.publishableKey, {
      global: { fetch: (url, options = {}) => fetch(url, {
        ...options, signal: options.signal || AbortSignal.timeout(20000)
      }) },
      auth: {
        storageKey: 'poy-supabase-session',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
    return client;
  }
  function check(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  async function allRows(query) {
    const rows = [];
    for (let offset = 0; ; offset += 100) {
      const batch = check(await query().range(offset, offset + 99));
      rows.push(...batch);
      if (batch.length < 100) return rows;
    }
  }
  function book(row) {
    return { ...row.data, id: row.id, ownerId: row.owner_id, visibility: row.visibility,
      memories: Array.isArray(row.data.memories) ? row.data.memories : [], _revision: row.updated_at };
  }
  async function publicBooks() {
    return (await allRows(() => connection().from('poy_books').select('*')
      .eq('visibility', 'public').order('id'))).map(book);
  }
  function message(error) {
    const text = error?.message || '';
    if (/poy_commit|PGRST202/.test(text)) return 'Falta concluir a configuração da base de dados (02-operacoes.sql).';
    if (/invalid login credentials/i.test(text)) return 'Email ou palavra-passe incorretos.';
    if (/email not confirmed/i.test(text)) return 'Confirme o seu email antes de entrar.';
    if (/already registered/i.test(text)) return 'Este email já está registado. Inicie sessão.';
    if (/rate limit|too many requests/i.test(text)) return 'Foram feitas demasiadas tentativas. Aguarde alguns minutos.';
    if (/fetch|network|load failed|timeout|abort/i.test(text)) return 'Não foi possível contactar o servidor. Verifique a ligação à Internet.';
    if (/row-level security|permission denied/i.test(text)) return 'Não tem autorização para esta operação. Verifique a sua sessão.';
    return text || 'Não foi possível concluir a operação. Volte a tentar.';
  }
  return { publicBooks, message };
})();

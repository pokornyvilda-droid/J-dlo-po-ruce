export default async (request) => {
  if (request.method !== 'POST') return new Response(JSON.stringify({error:'POST only'}), {status:405,headers:{'content-type':'application/json'}});
  const key = process.env.OPENAI_API_KEY;
  if (!key) return new Response(JSON.stringify({error:'AI není ještě aktivovaná. Na Netlify nastav OPENAI_API_KEY.'}), {status:503,headers:{'content-type':'application/json'}});
  try {
    const {image,portion='normal'} = await request.json();
    if (!image || !image.startsWith('data:image/')) throw new Error('Chybí obrázek.');
    const r = await fetch('https://api.openai.com/v1/responses', {
      method:'POST', headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-5.6-luna',
        input:[{role:'user',content:[
          {type:'input_text',text:`Jsi nutriční odhadovač pro aplikaci JÍDLO PO RUCE. Z fotografie odhadni, co je na talíři a orientační výživové hodnoty pro jednu porci. Velikost porce uživatel označil jako: ${portion}. Vrať pouze JSON: {"meal":"název jídla","description":"stručný popis","kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"confidence":"low|medium|high","assumptions":["..."]}. Neuváděj falešnou přesnost; hodnoty zaokrouhli. Pokud něco nejde poznat, uveď rozumný odhad a napiš předpoklad. Čeština.`},
          {type:'input_image',image_url:image}
        ]}]
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || 'OpenAI chyba');
    const text = data.output_text || '';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || text);
    return new Response(JSON.stringify(json),{headers:{'content-type':'application/json'}});
  } catch(e) { return new Response(JSON.stringify({error:e.message||'Analýza se nepodařila.'}),{status:500,headers:{'content-type':'application/json'}}); }
};

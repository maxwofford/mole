// this exists because sometimes the AI takes too long to respond to airtable webhooks
// so we use this for a backup review job

const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base('appG8uSnOYIz5EFky');

while (true) {
  console.log('checking for records to process...')
  const records = await base('tblFaURXmLAMIosCo').select({
    filterByFormula: `AND(
    {Action - AI infer} = TRUE(),
    {for_ysws} = BLANK()
  )`,
    maxRecords: 1
  }).all();

  if (records.length === 0) {
    console.log('no records to process')
    await Bun.sleep(3000)
  }

  for (const record of records) {
    console.log(`processing record https://airtable.com/appG8uSnOYIz5EFky/tblFaURXmLAMIosCo/viwc3wK0je9omhLRX/${record.id}?blocks=hide`);

    const { repo_url, deploy_url, readme_url } = record.fields;
    const response = await fetch('http://localhost:3000/analyze', {
      method: 'POST',
      body: JSON.stringify({ repoUrl: repo_url, demoUrl: deploy_url, readmeUrl: readme_url }),
    });

    const data = await response.json();
    console.log(data);

    await base('tblFaURXmLAMIosCo').update(record.id, {
      'Action - AI infer': false,
      'AI guess': data.decision,
      'AI reasoning': data.reason,
    });
  }
}
// this exists because sometimes the AI takes too long to respond to airtable webhooks
// so we use this for a backup review job

const Airtable = require('airtable');
const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base('appJoAAl0y0Pr2itM');

while (true) {
  console.log('checking for records to process...')
  const records = await base('tblVnBAyJGFUzRDes').select({
    filterByFormula: `AND(
    {ai_guess} = BLANK(),
    NOT(BLANK() = {play_url}),
    NOT(BLANK() = {repo_url})
    )`,
    maxRecords: 1
  }).all();

  if (records.length === 0) {
    console.log('no records to process')
    await Bun.sleep(3000)
  }

  for (const record of records) {
    console.log(`processing record https://airtable.com/appJoAAl0y0Pr2itM/tblVnBAyJGFUzRDes/viwp85DpaseqnbbrN/${record.id}?blocks=hide`);

    const { repo_url, play_url, readme_url } = record.fields;
    const response = await fetch('http://localhost:3000/analyze', {
      method: 'POST',
      body: JSON.stringify({ repoUrl: repo_url, demoUrl: play_url, readmeUrl: readme_url }),
    });

    const data = await response.json();
    console.log(data);

    await base('tblFaURXmLAMIosCo').update(record.id, {
      'ai_guess': data.decision,
      'ai_reasoning': data.reason,
    });
  }
}
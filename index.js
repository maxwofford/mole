import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

async function analyzeHackathonProject(repoUrl, demoUrl) {
  const response = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Please browse and analyze these project URLs and extract structured details:
- Repository URL: ${repoUrl}
- Demo URL: ${demoUrl}

Extract the following:
- name: the project's name
- description: Project summarized description
- readme_url: README raw URL
- counts_for_ysws: A true or false judgement of whether the project counts for YSWS
- ysws_reasoning: A short explanation of why the project counts for YSWS
- demo_url_type: justified_video | video | direct_link | inaccessible | other
- release_link: link to the project's release page (if there is one)
- release_type: executable | source | none (if there is a release page, and if it has a download link for a binary/iso/apk/etc.)
- readme_template: generic | nontemplated | none (if the readme is generated for a different project ie. create react app's readme is generic and not specific to the project. use none if there is no readme)
- is_fork: true | false (if the project is a fork of another project)

To decide if a project counts for YSWS, consider the following examples:
- most projects with a direct link (ie website, app, etc.) count for YSWS
- a screenshot of the project does not count for YSWS
- most projects with a video or image demo do not count for YSWS– a demo should be experiential, not just seeing a video or image of the project
- most projects with a video demo that is just a walkthrough of the code do not count for YSWS
- most projects that are a python script do not count for YSWS, unless they have a direct link
- published packages count for YSWS (ie. npm packages, python packages, etc.)
- forks can count for YSWS if they are significantly different from the original project
- projects that are just a readme with no code do not count for YSWS
- a video demo is justified if it's a demo of a physical device, robot, pcb, etc. that can't be uploaded as a live link
- languages that don't build to the web (ie. c, c++, c#, java, etc.) can have a video demo as long as they include a release or executable
- the project's demo is a video, but they include a direct link in the README

Return results in clean JSON format.`
      }
    ]
  });

  return response.content[0].text
}

async function main() {
  const result = await analyzeHackathonProject(
    'https://github.com/Pegoku/cookieCutter-bakebuild',
    'https://cloud-jz0g1fzme-hack-club-bot.vercel.app/0screenshot_2025-01-18_16.43.55.png'
    // 'https://github.com/Pegoku/18650-Powerbank', 
    // 'https://cloud-1s4wek7ql-hack-club-bot.vercel.app/0recording_2025-01-26_20.52.10.mp4'
  );
  console.log(JSON.stringify(JSON.parse(result), null, 2))
}

main().catch(console.error)
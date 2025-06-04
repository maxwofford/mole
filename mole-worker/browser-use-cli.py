import os
import sys
import json
import asyncio
from pathlib import Path

from browser_use.agent.views import ActionResult
from langchain_anthropic import ChatAnthropic
from browser_use import Agent, Controller
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import BrowserContext


async def main(prompt):
    api_key = os.environ.get('ANTHROPIC_API_KEY')
    
    browser = Browser(
        config=BrowserConfig(
            # Use headless mode in Docker
            headless=True
        )
    )

    gif_path = '/tmp/agent_history_gifs/' + str(hash(prompt)) + '.gif'
    
    # Create the directory if it doesn't exist
    Path(gif_path).parent.mkdir(parents=True, exist_ok=True)

    agent = Agent(
        task=prompt,
        llm=ChatAnthropic(
            model='claude-3-5-sonnet-20241022',
            api_key=api_key
        ),
        browser=browser,
        generate_gif=gif_path
    )

    result = await agent.run()

    # Get the final result
    final_result = result.final_result()

    # Close all contexts and browser
    try:
        if browser.playwright_browser:
            contexts = browser.playwright_browser.contexts
            for context in contexts:
                for page in await context.pages():
                    await page.close()
                await context.close()
            await browser.playwright_browser.close()
        await browser.close()
    except Exception as e:
        pass

    return [str(final_result).lower(), gif_path]


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Missing required argument: prompt'}))
        sys.exit(1)
    
    try:
        prompt = sys.argv[1]
        result = asyncio.run(main(prompt))
        
        # Output result as JSON
        print(json.dumps({
            'result': result[0],
            'gif': result[1]
        }))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)

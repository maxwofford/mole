import os
import sys
import json
import asyncio
from pathlib import Path

from browser_use.agent.views import ActionResult
from browser_use import Agent, Controller
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import BrowserContext


def get_llm():
    """Get the appropriate LLM based on AI_PROVIDER environment variable"""
    ai_provider = os.environ.get('AI_PROVIDER', 'anthropic')
    
    if ai_provider == 'gemini':
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.environ.get('GEMINI_API_KEY')
        if not api_key:
            raise ValueError('GEMINI_API_KEY required when AI_PROVIDER=gemini')
        return ChatGoogleGenerativeAI(
            model='gemini-2.0-flash',
            google_api_key=api_key
        )
    elif ai_provider == 'anthropic':
        from langchain_anthropic import ChatAnthropic
        api_key = os.environ.get('ANTHROPIC_API_KEY')
        if not api_key:
            raise ValueError('ANTHROPIC_API_KEY required when AI_PROVIDER=anthropic')
        return ChatAnthropic(
            model='claude-3-5-sonnet-20241022',
            api_key=api_key
        )
    elif ai_provider == 'ollama':
        from langchain_community.llms import Ollama
        base_url = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
        model = os.environ.get('OLLAMA_MODEL', 'llama3.1')
        return Ollama(base_url=base_url, model=model)
    else:
        raise ValueError(f'Unsupported AI provider: {ai_provider}')


async def main(prompt):
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
        llm=get_llm(),
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

import os
import sys
from pathlib import Path
from queue import Queue
from threading import Thread
from flask import Flask, request, jsonify

from browser_use.agent.views import ActionResult

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio

from langchain_openai import ChatOpenAI

from browser_use import Agent, Controller
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import BrowserContext

# Initialize Flask app
app = Flask(__name__)

# Create a queue for handling requests
request_queue = Queue()


async def main(prompt):
	browser = Browser(
		config=BrowserConfig(
			# NOTE: you need to close your chrome browser - so that this can open your browser in debug mode
			# chrome_instance_path='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',

			# wss_url=f'wss://production-sfo.browserless.io/chrome/playwright?token={os.getenv("BROWSERLESS_API_KEY")}'
		)
	)

	gif_path = 'agent_history_gifs/' + str(hash(prompt)) + '.gif'

	agent = Agent(
		task=prompt,
		llm=ChatOpenAI(model='gpt-4o'),
		browser=browser,
		generate_gif=gif_path
	)

	result = await agent.run()

	# Close all contexts and browser
	if browser.playwright_browser:
		contexts = browser.playwright_browser.contexts
		for context in contexts:
			for page in await context.pages():
				await page.close()
			await context.close()
		await browser.playwright_browser.close()
	await browser.close()

	return [result.final_result().lower(), gif_path]

def process_queue():
	"""Process requests from the queue"""
	while True:
		if not request_queue.empty():
			request_data = request_queue.get()
			result = asyncio.run(main(request_data['prompt']))
			request_data['response_queue'].put(result)
			request_queue.task_done()

# Start the queue processing thread
queue_thread = Thread(target=process_queue, daemon=True)
queue_thread.start()

@app.route('/process', methods=['POST'])
def process_request():
	try:
		data = request.get_json()
		if not data or 'prompt' not in data:
			return jsonify({'error': 'Missing required field: prompt'}), 400

		# Create a queue for this specific request's response
		response_queue = Queue()
		
		# Add request to queue with its response queue
		request_queue.put({
			'prompt': data['prompt'],
			'response_queue': response_queue
		})

		# Wait for the response
		result = response_queue.get()
		return jsonify({'result': result[0], 'gif': result[1]})

	except Exception as e:
		return jsonify({'error': str(e)}), 500

@app.route('/ping', methods=['GET'])
def ping():
	return jsonify({'status': 'ok'}), 200

if __name__ == '__main__':
	if len(sys.argv) > 1:
		# Command line usage
		prompt = sys.argv[1]
		asyncio.run(main(prompt))
	else:
		# Start Flask server
		app.run(host='0.0.0.0', port=3001)

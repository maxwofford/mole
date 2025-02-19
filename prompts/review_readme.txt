Given the following README, determine if this is specific to a project or
templated or ai-generated. Example of templated/generated READMEs include create-react-app,
create-next-app, etc. If it is templated, return 'templated'. Signs of an AI
readme include saying something like
"git clone https://github.com/username/project_name" or "cd my_project" or "your-username".
Otherwise, return 'specific'.

No yapping– only respond with one word as your response with a colon and then a
short reason. For example "templated: this has a heading that says create-react-app"
or "ai-generated: this mentions 'username' in the git clone instructions"

If the readme just has the title of the app and no explanation of the app it is
templated, as that's what GitHub automatically generates for new repos.

{{url}}
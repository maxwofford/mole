class Project
  def initialize(repo_url:, play_url:, readme_url:, project_type:)
    @repo_url = repo_url
    @play_url = play_url
    @readme_url = readme_url
    @project_type = project_type

    ensure_repo_exists
    ensure_readme_exists
    set_readme_content
    ensure_play_exists

    @project_type ||= Check.run(ProjectClassifier, @repo_url, @play_url, @readme_url)
  end

  def ensure_readme_exists
    if @readme_url.blank?
      readme_url = Check.run(SearchReadmeLink, @repo_url)

      @readme_url = readme_url
    end
  end

  def ensure_play_exists
    if @play_url.blank?
      play_url = Check.run(SearchPlayLink, @repo_url)

      @play_url = play_url
    end
  end

  def ensure_repo_exists
    if @repo_url.blank?
      raise "Repo URL is blank"
    end
  end

  def set_readme_content
    if @readme_url.blank?
      raise "Readme URL is blank"
    end

    @readme_content = Check.run(ReadmeContent, @readme_url)
  end
end
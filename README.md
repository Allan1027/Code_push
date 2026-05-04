# CodePush
## Description
CodePush is a web application that allows users to upload their code and generate an automated README file, which can then be reviewed and published on GitHub.

## Features
* Upload code from a file or locally in the browser
* Generate an automated README file based on the uploaded code
* Review and edit the generated README file
* Publish the final README file to a GitHub repository

## Requirements
* A web browser (e.g. Chrome, Firefox)
* Python 3.8 or later (for running the server)

## Installation
1. Clone this repository using `git clone https://github.com/username/codepush.git`
2. Navigate into the cloned repository: `cd codepush`
3. Run the following command to start the server: `python -m http.server 8080`

## Usage
1. Open a web browser and navigate to `http://localhost:8080`
2. Click on "Upload Code" to select a file or upload code locally in the browser
3. Wait for the automated README generation process to complete
4. Review and edit the generated README file as needed
5. Publish the final README file to a GitHub repository

## File Structure
* `app.js`: The main application file, responsible for handling user interactions and updating the DOM.
* `index.html`: The main HTML file, which serves as the entry point for the application.
* `style.css`: The CSS file, which styles the application's UI.
* `start.bat` (Windows only): A batch script that starts the server when executed.
* `codepush/`: The root directory of the repository, containing all project files.
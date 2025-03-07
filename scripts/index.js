const vscode = require("vscode");
const { activate: activatePopup } = require("./provider.js");
const { activate: activateValidation } = require("./validation.js");

function activate(context) {
  // activatePopup(context);
  activateValidation(context);
  registerEmmetForSvem();
}

function deactivate() {}

function registerEmmetForSvem() {
  const config = vscode.workspace.getConfiguration("emmet");
  const includeLanguages = config.get("includeLanguages") || {};

  if (includeLanguages["svem"] !== "html") {
    includeLanguages["svem"] = "html";

    config
      .update(
        "includeLanguages",
        includeLanguages,
        vscode.ConfigurationTarget.Global
      )
      .then(
        () => {
          vscode.window.showInformationMessage(
            `Emmet autocomplete enabled for 'svem'! 👑`
          );
        },
        (error) => {
          vscode.window.showErrorMessage(
            `Failed to enable Emmet for 'svem': ${error}`
          );
        }
      );
  }
}

module.exports = { activate, deactivate };

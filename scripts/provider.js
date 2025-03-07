const vscode = require("vscode");

class HoverProvider {
  providers = [];

  constructor(...providers) {
    this.providers.push(...providers);
  }

  use(provider) {
    if (typeof provider === "object") {
      this.providers.push(provider);
    }

    return this;
  }

  resolve(line = "", token = "") {
    const provider = this.providers.find((p) => p.match(line));

    if (provider) {
      return provider.parse(line, token);
    }
  }
}

function svelteProvider() {
  return {
    match(text = "") {
      return /^(\s+)?<[A-Z][a-z0-9\-_]+/.test(text);
    },
    parse(text = "", token = "") {
      return `**Svelte Component**: A Svelte component to render a custom element.`;
    },
  };
}

function directiveProvider() {
  const knownDirectives = {
    "code-preview": `
**Code Preview Directive**
 
A markdown block to render code preview. It will renders a tabbed element with Preview and Code.
 
**Attributes**
 
Code preview accepts HTML-like attributes and it will be rendered to the HTML element. Example:

- **id**: The unique identifier for the tab.
- **class**: The CSS class to apply to the tab.
    `,
    "code-group": `
**Code Group Directive**

A markdown block to render code group. It will renders a tabbed element with multiple code snippets.
    `,
  };

  return {
    match(text = "") {
      return text.startsWith(":::");
    },
    parse(text = "") {
      if (text.match(/^:::$/)) {
        return `**Directive**: End of directive.`;
      }

      const [, name] = text.split(" ");

      if (knownDirectives[name]) {
        return knownDirectives[name];
      }

      return `**Directive**: A markdown block to render customized elements such as tab, callouts, etc.`;
    },
  };
}

function activate(context) {
  const host = new HoverProvider();
  host.use(directiveProvider()).use(svelteProvider());

  const popupProvider = vscode.languages.registerHoverProvider("svem", {
    provideHover(document, position) {
      const line = document.lineAt(position);
      const range = document.getWordRangeAtPosition(position);
      let token = "";

      if (range) {
        token = document.getText(range);
      }

      const result = host.resolve(line.b, token);
      if (!result) return;

      return new vscode.Hover(
        new vscode.MarkdownString(result || "No documentation available.")
      );
    },
  });
  context.subscriptions.push(popupProvider);
}

module.exports = {
  activate,
};

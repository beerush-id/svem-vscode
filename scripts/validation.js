// extension.js
const vscode = require("vscode");

function activate(context) {
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("blockErrors");
  context.subscriptions.push(diagnosticCollection);

  vscode.workspace.onDidOpenTextDocument(
    (document) => {
      validateDocument(document, diagnosticCollection);
    },
    null,
    context.subscriptions
  );

  vscode.workspace.onDidChangeTextDocument(
    (event) => {
      handleDocumentChange(event);
      validateDocument(event.document, diagnosticCollection);
    },
    null,
    context.subscriptions
  );
}

const SELF_CLOSING_TAGS = [
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
];

function handleDocumentChange(event) {
  const editor = vscode.window.activeTextEditor;

  event.contentChanges.forEach((change) => {
    // Auto close tags.
    if (change.text === ">") {
      const doc = editor.document;
      const position = change.range.end;
      const { line, character } = position;
      const lineText = doc.getText(
        new vscode.Range(new vscode.Position(line, 0), position)
      );
      const textBefore = getClosestOpenTag(lineText);

      // Skip if the tag is self-closing or already closed.
      if (textBefore.endsWith("/") || /<\/[a-zA-Z0-9_]+$/.test(textBefore)) {
        return;
      }

      // Match the last opening tag
      const match = textBefore.match(/<([a-zA-Z0-9_]+)/);

      if (match?.[1]) {
        const tagName = match[1];
        const selfClose = SELF_CLOSING_TAGS.includes(tagName);

        if (selfClose) {
          editor.edit((editBuilder) => {
            editBuilder.insert(position, " /");
          });

          return;
        }

        const closingTag = `</${tagName}>`;
        const insertPosition = new vscode.Position(line, character + 1);

        editor
          .edit((editBuilder) => {
            editBuilder.insert(insertPosition, closingTag);
          })
          .then(() => {
            editor.selection = new vscode.Selection(
              insertPosition,
              insertPosition
            );
          });
      }
    }
  });
}

function getClosestOpenTag(text = "") {
  const chars = [];

  for (let i = text.length - 1; i >= 0; i--) {
    const char = text[i];

    if (char === "<") {
      chars.push(char);
      return chars.reverse().join("");
    }

    chars.push(char);
  }
}

function deactivate() {
  // Clean up if necessary
}

function validateDocument(document, diagnosticCollection) {
  if (document.languageId !== "svem") {
    diagnosticCollection.clear();
    return;
  }

  const diagnostics = [];

  validateFrontMatter(document, diagnostics);
  validateDirective(document, diagnostics);

  const [scriptBlock, markups] = validadteBlocks(document, diagnostics);
  validateMarkups(document, diagnostics, scriptBlock, markups);

  diagnosticCollection.set(document.uri, diagnostics);
}

function validateDirective(document, diagnostics) {
  const regex = /^:::\s?/;
  const stack = [];

  // Iterate through each line using VSCode's API for accurate position
  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (/^:::\s+$/.test(line)) {
      const range = new vscode.Range(i, 0, i, line.length);
      const message = "⚠️ [:::] End of directive block can not have spaces.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }

    if (/^\s+:::/.test(line)) {
      const range = new vscode.Range(i, 0, i, line.length);
      const message = "⚠️ [:::] Directive block can not have leading spaces.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }

    if (regex.test(line.trim())) {
      // Check for blank lines before and after
      const hasBlankLineBefore =
        i === 0 || document.lineAt(i - 1).text.trim() === "";
      const hasBlankLineAfter =
        i === document.lineCount - 1 ||
        document.lineAt(i + 1).text.trim() === "";

      if (!hasBlankLineBefore || !hasBlankLineAfter) {
        const range = new vscode.Range(i, 0, i, line.length);
        const message =
          "⚠️ [:::] Directive block must be on its own line with blank lines before and after.";
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      }

      // Block closure validation
      if (stack.length === 0) {
        stack.push(i); // Push the line number of the start
      } else {
        stack.pop(); // Pop the last start when an end is found
      }
    }
  }

  // Report unclosed blocks
  stack.forEach((line) => {
    const text = document.lineAt(line).text;
    const range = new vscode.Range(line, 0, line, text.length);
    const message = "⚠️ [:::] Directive block not properly closed.";
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostics.push(diagnostic);
  });
}

function validadteBlocks(document, diagnostics) {
  const blocks = [];
  const matters = [];
  const scripts = [];
  const markups = [];
  const pattern = /^\s?```/;

  let currentMatter = null;
  let currentBlock = null;
  let currentScript = null;
  let markupStarted = false;

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (/^\s+```/.test(line)) {
      const range = new vscode.Range(i, 0, i, line.length);
      const message = "⚠️ [```] Code block can not have leading spaces.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }

    if (/^```\s+/.test(line)) {
      const range = new vscode.Range(i, 0, i, line.length);
      const message = "⚠️ [```] Code block can not have trailing spaces.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }

    if (pattern.test(line)) {
      if (currentBlock) {
        if (!/^```$/.test(line.trim())) {
          const range = new vscode.Range(
            currentBlock.start,
            0,
            i - 1,
            line.length
          );
          const message =
            "⚠️ [```] Nested code blocks are not allowed. Please close the current code block before opening a new one.";
          const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
          );
          diagnostics.push(diagnostic);
        } else {
          currentBlock.children.push(line);
          currentBlock.end = i;
          currentBlock = null;
        }
      } else {
        if (/^```$/.test(line.trim())) {
          const range = new vscode.Range(i, 0, i, line.length);
          const message =
            "⚠️ [```] Code block must have a language identifier.";
          const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
          );
          diagnostics.push(diagnostic);
        }

        currentBlock = {
          start: i,
          children: [line],
          end: null,
        };

        blocks.push(currentBlock);
      }
    } else if (currentBlock) {
      currentBlock.children.push(line);
    } else if (/^<script/.test(line.trim())) {
      if (
        markups
          .map(({ text }) => text)
          .join("")
          .trim() !== ""
      ) {
        const range = new vscode.Range(i, 0, i, line.length);
        const message =
          "⚠️ Script tag must be at the top of the document, or after the front matter block.";
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      }

      if (currentScript) {
        const range = new vscode.Range(
          currentScript.start,
          0,
          i - 1,
          line.length
        );
        const message =
          "⚠️ Nested script tags are not allowed. Please close the current script tag before opening a new one.";
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      } else {
        currentScript = {
          start: i,
          startLength: line.length,
          isModule: /module/.test(line),
          children: [line],
          end: null,
          endLength: null,
        };

        scripts.push(currentScript);
      }
    } else if (currentScript) {
      currentScript.children.push(line);

      if (/^<\/script>/.test(line.trim())) {
        currentScript.end = i;
        currentScript.endLength = line.length;
        currentScript = null;
      }
    } else if (/^---$/.test(line.trim())) {
      if (currentMatter) {
        currentMatter.end = i;
        currentMatter = null;
      } else {
        currentMatter = {
          start: i,
          children: [line],
          end: null,
        };
        matters.push(currentMatter);
      }
    } else if (currentMatter) {
      currentMatter.children.push(line);
    } else {
      if (!markupStarted) {
        markupStarted = true;
      }

      markups.push({
        line: i,
        text: line,
      });
    }
  }

  if (currentBlock) {
    const range = new vscode.Range(
      currentBlock.start,
      0,
      document.lineCount,
      3
    );
    const message = "⚠️ [```] Code block starting here is not closed.";
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostics.push(diagnostic);
  }

  if (currentScript) {
    const range = new vscode.Range(
      currentScript.start,
      0,
      document.lineCount,
      9
    );
    const message = "⚠️ Script tag starting here is not closed.";
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostics.push(diagnostic);
  }

  if (scripts.length > 1) {
    for (const script of scripts) {
      const range = new vscode.Range(
        script.start,
        0,
        script.start,
        script.startLength
      );
      const message = "⚠️ Only one script tag is allowed.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }
  } else if (scripts.length === 2) {
    const hasModule = scripts.some((script) => script.isModule);

    if (!hasModule) {
      for (const script of scripts) {
        const range = new vscode.Range(
          script.start,
          0,
          script.start,
          script.startLength
        );
        const message = "⚠️ One of the script tags must be a module script.";
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      }
    }
  }

  const scriptBlock = scripts.flatMap((script) => script.children).join("\n");
  return [scriptBlock, markups];
}

function validateFrontMatter(document, diagnostics) {
  let blockOpen = false;
  let openRange = 0;
  let wrongPlacement = false;

  const blocks = [];

  for (let i = 0; i < document.lineCount; i++) {
    const line = document.lineAt(i).text;

    if (line.trim() === "---") {
      if (!blockOpen) {
        blockOpen = true;
        openRange = i;

        if (i > 0) {
          wrongPlacement = true;
        }

        continue;
      }

      if (blockOpen) {
        blocks.push([openRange, i]);
        blockOpen = false;
        continue;
      }
    }
  }

  if (wrongPlacement) {
    for (const block of blocks) {
      const range = new vscode.Range(block[0], 0, block[1], 3);
      const message = "⚠️ [---] Front matter block must be at the top.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }
  }

  if (!blockOpen && blocks.length > 1) {
    for (const block of blocks) {
      const range = new vscode.Range(block[0], 0, block[1], 3);
      const message = "⚠️ [---] Only one front matter block is allowed.";
      const diagnostic = new vscode.Diagnostic(
        range,
        message,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }
  }
}

function validateMarkups(document, diagnostics, script, markups = ([] = "")) {
  // Check if each component is reachable from the script block
  for (const { line, text } of markups) {
    const [component] = text.match(/(?<!`)<[A-Z][a-zA-Z0-9_]+\s?/g) || [];

    if (component) {
      // @TODO: Implement reachability check.
      const tag = component.replace("<", "").trim();
      // const inImport = new RegExp(
      //   `import\\s*{[^}]*\\b${tag}\\b[^}]*}\\s*from\\s*['"][^'"]+['"];?`,
      //   "gm" // Flags: g - global, m - multiline
      // );
      // const inVariable = new RegExp(`(const|let|var)\\s+${tag}`);
      // const reachable = inImport.test(script) || inVariable.test(script);
      const reachable = script.includes(tag);

      if (!reachable) {
        const range = new vscode.Range(line, 0, line, component.length);
        const message = `⚠️ [${tag}] Component is not reachable from the script block. Please import it before using.`;
        const diagnostic = new vscode.Diagnostic(
          range,
          message,
          vscode.DiagnosticSeverity.Error
        );
        diagnostics.push(diagnostic);
      }
    }
  }

  // Check for unclosed tags
  const unclosed = validateHTMLTags(markups);

  for (const { tag, text, line } of unclosed) {
    const range = new vscode.Range(line, 0, line, text.length);
    const message = `⚠️ [${tag}] Element is not properly closed.`;
    const diagnostic = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Error
    );
    diagnostics.push(diagnostic);
  }

  const markupText = markups.map(({ text }) => text).join("\n");
  // console.log([script, markupText].join("\n"));
}

function validateHTMLTags(lines) {
  const stack = [];
  const unclosedTags = [];

  // Regex to match opening, closing, and self-closing tags
  const tagRegex = /(?<!`)<\/?([a-zA-Z0-9_]+)(\s[^>]*)?(\/?)>(?!`)/g;

  for (const { line, text } of lines) {
    let match;

    while ((match = tagRegex.exec(text)) !== null) {
      const tag = match[1];
      const isClosingTag = match[0].startsWith("</");
      const isSelfClosing = match[0].endsWith("/>");

      if (isClosingTag) {
        if (stack.length === 0 || stack[stack.length - 1].tag !== tag) {
          unclosedTags.push({ tag, text, line });
        } else {
          stack.pop();
        }
      } else if (!isSelfClosing) {
        // It's an opening tag
        stack.push({ tag, text, line });
      }
      // If it's a self-closing tag, do nothing
    }
  }

  // Any remaining tags in the stack are unclosed
  while (stack.length > 0) {
    const { tag, text, line } = stack.pop();
    unclosedTags.push({ tag, text, line });
  }

  return unclosedTags;
}

module.exports = {
  activate,
  deactivate,
};

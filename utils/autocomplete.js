// Workspace Manager - Autocomplete Module
// Provides VS Code-style inline autocomplete for prompt templates

(function (global) {
  const chromeAPI = typeof chrome !== 'undefined' ? chrome : (typeof browser !== 'undefined' ? browser : null);

  class SkillsAutocomplete {
    constructor(element, options = {}) {
      this.element = element;
      this.onQuery = options.onQuery || null;
      this.triggerChar = "@"; // default, gets synced dynamically from storage
      
      this.state = "CLOSED"; // CLOSED, TRIGGERED
      this.dropdown = null;
      this.items = [];
      this.selectedIndex = -1;
      this.searchPrefix = "";
      this.triggerIndex = -1;

      this.initTriggerChar();
      this.bindEvents();
    }

    async initTriggerChar() {
      if (chromeAPI && chromeAPI.storage && chromeAPI.storage.local) {
        chromeAPI.storage.local.get(['autocompleteTriggerChar'], (data) => {
          this.triggerChar = data.autocompleteTriggerChar || "@";
        });

        chromeAPI.storage.onChanged.addListener((changes) => {
          if (changes.autocompleteTriggerChar) {
            this.triggerChar = changes.autocompleteTriggerChar.newValue || "@";
          }
        });
      }
    }

    bindEvents() {
      this.element.addEventListener('input', (e) => this.handleInput(e));
      this.element.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
      
      // Close dropdown if user clicks elsewhere
      const clickHandler = (e) => {
        if (this.dropdown && !this.dropdown.contains(e.target) && e.target !== this.element) {
          this.hideDropdown();
        }
      };
      document.addEventListener('click', clickHandler);

      this.element.addEventListener('blur', () => {
        // Delay slightly to allow click selections to process
        setTimeout(() => this.hideDropdown(), 150);
      });
    }

    isContentEditable() {
      return this.element.isContentEditable || 
             (this.element.tagName === "DIV" && this.element.getAttribute("contenteditable") === "true");
    }

    getTextBeforeCaret() {
      if (!this.isContentEditable()) {
        return this.element.value.substring(0, this.element.selectionStart);
      }

      const selection = window.getSelection();
      if (!selection.rangeCount) return "";
      const range = selection.getRangeAt(0);
      const node = range.startContainer;
      
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent.substring(0, range.startOffset);
      }
      return "";
    }

    async handleInput(e) {
      if (this.triggerChar === "disabled" || this.triggerChar === "None") {
        this.hideDropdown();
        return;
      }

      const textBefore = this.getTextBeforeCaret();
      const lastTriggerIndex = textBefore.lastIndexOf(this.triggerChar);

      if (lastTriggerIndex !== -1) {
        const query = textBefore.substring(lastTriggerIndex + this.triggerChar.length);
        const charBeforeTrigger = lastTriggerIndex > 0 ? textBefore.charAt(lastTriggerIndex - 1) : "";
        const isWordBoundary = charBeforeTrigger === "" || /\s/.test(charBeforeTrigger);

        // Word boundary check and no spaces in the query string
        if (isWordBoundary && /^\w*$/.test(query)) {
          this.state = "TRIGGERED";
          this.searchPrefix = query;
          this.triggerIndex = lastTriggerIndex;

          if (this.onQuery) {
            try {
              const matches = await this.onQuery(this.searchPrefix);
              if (matches && matches.length > 0) {
                this.showDropdown(matches);
              } else {
                this.hideDropdown();
              }
            } catch (err) {
              console.error("[SkillsAutocomplete] Query callback failed:", err);
              this.hideDropdown();
            }
          }
          return;
        }
      }

      this.hideDropdown();
    }

    handleKeyDown(e) {
      if (this.state !== "TRIGGERED" || !this.dropdown) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
          this.updateSelection();
          break;
        case "ArrowUp":
          e.preventDefault();
          this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
          this.updateSelection();
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          if (this.selectedIndex >= 0 && this.selectedIndex < this.items.length) {
            this.commitSelection(this.items[this.selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          this.hideDropdown();
          break;
      }
    }

    showDropdown(matches) {
      this.items = matches;
      if (!this.dropdown) {
        this.dropdown = document.createElement("div");
        this.dropdown.id = "agy-autocomplete-dropdown";
        
        // Premium HSL Tailored Dark Theme Styles
        Object.assign(this.dropdown.style, {
          position: "absolute",
          zIndex: "999999",
          background: "rgba(18, 18, 24, 0.95)",
          backdropFilter: "blur(12px)",
          webkitBackdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "8px",
          boxShadow: "0 8px 32px 0 rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)",
          maxHeight: "220px",
          overflowY: "auto",
          padding: "4px",
          width: "250px",
          fontFamily: "'Outfit', -apple-system, sans-serif"
        });

        document.body.appendChild(this.dropdown);
      }

      this.dropdown.innerHTML = "";
      this.selectedIndex = 0;

      matches.forEach((match, index) => {
        const item = document.createElement("div");
        item.className = "agy-autocomplete-item";
        
        Object.assign(item.style, {
          display: "flex",
          flexDirection: "column",
          padding: "6px 12px",
          borderRadius: "6px",
          cursor: "pointer",
          transition: "all 0.15s ease",
          marginBottom: "2px"
        });

        const keyLabel = document.createElement("strong");
        keyLabel.textContent = match.keyword;
        keyLabel.style.fontSize = "13px";
        keyLabel.style.fontWeight = "600";
        keyLabel.style.color = "var(--accent-indigo, #6366f1)";

        const descLabel = document.createElement("span");
        descLabel.textContent = match.description || "";
        descLabel.style.fontSize = "10px";
        descLabel.style.color = "#64748b";
        descLabel.style.whiteSpace = "nowrap";
        descLabel.style.overflow = "hidden";
        descLabel.style.textOverflow = "ellipsis";
        descLabel.style.marginTop = "2px";

        item.appendChild(keyLabel);
        item.appendChild(descLabel);

        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.commitSelection(match);
        });

        item.addEventListener('mouseenter', () => {
          this.selectedIndex = index;
          this.updateSelection();
        });

        this.dropdown.appendChild(item);
      });

      this.updateSelection();
      this.positionDropdown();
    }

    updateSelection() {
      if (!this.dropdown) return;
      const items = this.dropdown.children;
      for (let i = 0; i < items.length; i++) {
        const isSelected = i === this.selectedIndex;
        items[i].style.background = isSelected ? "rgba(99, 102, 241, 0.2)" : "transparent";
        
        const keywordNode = items[i].querySelector("strong");
        if (keywordNode) {
          keywordNode.style.color = isSelected ? "#a5b4fc" : "var(--accent-indigo, #6366f1)";
        }
      }
    }

    positionDropdown() {
      if (!this.dropdown) return;
      
      const caretCoords = this.getCaretCoordinates();
      if (caretCoords) {
        this.dropdown.style.top = `${caretCoords.top}px`;
        this.dropdown.style.left = `${caretCoords.left}px`;
      }
    }

    getCaretCoordinates() {
      if (this.isContentEditable()) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0).cloneRange();
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 || rect.height > 0) {
            return {
              top: rect.bottom + window.scrollY,
              left: rect.left + window.scrollX
            };
          }
        }
        const elRect = this.element.getBoundingClientRect();
        return {
          top: elRect.bottom + window.scrollY,
          left: elRect.left + window.scrollX
        };
      }

      const element = this.element;
      const position = element.selectionStart;
      
      const div = document.createElement("div");
      const styles = window.getComputedStyle(element);
      
      const properties = [
        "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
        "borderWidth", "borderStyle", "borderColor",
        "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
        "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
        "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign",
        "textTransform", "textIndent", "textDecoration",
        "letterSpacing", "wordSpacing", "tabSize", "MozTabSize"
      ];
      
      properties.forEach(prop => {
        div.style[prop] = styles[prop];
      });
      
      div.style.position = "absolute";
      div.style.visibility = "hidden";
      div.style.whiteSpace = "pre-wrap";
      div.style.wordBreak = "break-all";
      div.style.top = "0";
      div.style.left = "0";
      
      const textBefore = element.value.substring(0, position);
      div.textContent = textBefore;
      
      const span = document.createElement("span");
      span.textContent = "|";
      div.appendChild(span);
      
      document.body.appendChild(div);
      
      const elementRect = element.getBoundingClientRect();
      const spanRect = span.getBoundingClientRect();
      const divRect = div.getBoundingClientRect();
      
      const top = elementRect.top + window.scrollY + spanRect.top - divRect.top + parseInt(styles.fontSize || "14", 10);
      const left = elementRect.left + window.scrollX + spanRect.left - divRect.left;
      
      document.body.removeChild(div);
      
      return { top, left };
    }

    commitSelection(match) {
      if (!match) return;

      const promptInjected = `\n\n${match.prompt}\n\n`;

      if (!this.isContentEditable()) {
        const selectionEnd = this.element.selectionEnd;
        this.element.focus();
        this.element.setSelectionRange(this.triggerIndex, selectionEnd);
        document.execCommand('insertText', false, promptInjected);
      } else {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          const textNode = range.startContainer;
          if (textNode.nodeType === Node.TEXT_NODE) {
            const newRange = document.createRange();
            newRange.setStart(textNode, this.triggerIndex);
            newRange.setEnd(textNode, range.endOffset);
            selection.removeAllRanges();
            selection.addRange(newRange);
          }
          document.execCommand('insertText', false, promptInjected);
        }
      }

      this.hideDropdown();
    }

    hideDropdown() {
      this.state = "CLOSED";
      if (this.dropdown) {
        document.body.removeChild(this.dropdown);
        this.dropdown = null;
      }
    }
  }

  // Export globally
  global.SkillsAutocomplete = SkillsAutocomplete;
})(typeof self !== 'undefined' ? self : this);

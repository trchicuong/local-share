/**
 * Segmented Code / PIN Input Component
 * Supports auto-focus advance, backspace navigation, arrow keys, and multi-character paste
 */
export class SegmentedInput {
  constructor(container, options = {}) {
    this.container = container;
    this.regex = options.regex || /^[0-9]$/;
    this.transform = options.transform || ((val) => val);
    this.onComplete = options.onComplete || (() => {});
    this.onChange = options.onChange || (() => {});
    this.inputs = Array.from(this.container.querySelectorAll('input'));

    this._bindEvents();
  }

  _bindEvents() {
    this.inputs.forEach((input, index) => {
      // Input event: single character typed
      input.addEventListener('input', (e) => {
        const raw = e.target.value.slice(-1);
        const val = this.transform(raw);
        if (val && this.regex.test(val)) {
          e.target.value = val;
          e.target.classList.add('filled');
          if (index < this.inputs.length - 1) {
            this.inputs[index + 1].focus();
            this.inputs[index + 1].select();
          }
        } else {
          e.target.value = '';
          e.target.classList.remove('filled');
        }
        this._notify();
      });

      // Keydown event: backspace & arrows navigation
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace') {
          if (!input.value && index > 0) {
            e.preventDefault();
            this.inputs[index - 1].value = '';
            this.inputs[index - 1].classList.remove('filled');
            this.inputs[index - 1].focus();
            this._notify();
          } else {
            input.classList.remove('filled');
          }
        } else if (e.key === 'ArrowLeft' && index > 0) {
          e.preventDefault();
          this.inputs[index - 1].focus();
          this.inputs[index - 1].select();
        } else if (e.key === 'ArrowRight' && index < this.inputs.length - 1) {
          e.preventDefault();
          this.inputs[index + 1].focus();
          this.inputs[index + 1].select();
        }
      });

      // Focus / Click: select contents for immediate overwrite
      input.addEventListener('focus', () => input.select());
      input.addEventListener('click', () => input.select());

      // Paste event: distribute clipboard across segmented cells
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        this.setValue(pastedData, 0);
      });
    });
  }

  getValue() {
    return this.inputs.map((inp) => inp.value).join('');
  }

  setValue(str, startIndex = 0) {
    if (!str) return;
    const cleanChars = str
      .split('')
      .map(this.transform)
      .filter((c) => this.regex.test(c));

    let charIdx = 0;
    for (let i = startIndex; i < this.inputs.length && charIdx < cleanChars.length; i++) {
      this.inputs[i].value = cleanChars[charIdx++];
      this.inputs[i].classList.add('filled');
    }

    const nextIdx = Math.min(this.inputs.length - 1, startIndex + cleanChars.length);
    this.inputs[nextIdx]?.focus();
    this.inputs[nextIdx]?.select();

    this._notify();
  }

  clear() {
    this.inputs.forEach((inp) => {
      inp.value = '';
      inp.classList.remove('filled');
    });
    this.inputs[0]?.focus();
    this._notify();
  }

  focus() {
    const unfilled = this.inputs.find((inp) => !inp.value) || this.inputs[0];
    unfilled?.focus();
    unfilled?.select();
  }

  _notify() {
    const value = this.getValue();
    this.onChange(value);
    if (value.length === this.inputs.length) {
      this.onComplete(value);
    }
  }
}


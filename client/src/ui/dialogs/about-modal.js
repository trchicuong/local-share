import { t } from '../../utils/i18n.js';
import { events } from '../../core/events.js';

export class AboutModal {
  constructor(modalElement) {
    this.modal = modalElement;

    events.on('language-changed', () => {
      if (!this.modal.classList.contains('hidden') && this.isOpen) {
        this.render();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.render();
  }

  render() {
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card about-card">
        <div class="modal-header">
          <h3>${t('about.title')}</h3>
          <button class="modal-close-btn" id="about-close-btn">&times;</button>
        </div>

        <div class="about-hero">
          <div class="about-logo-wrapper">
            <img src="/images/apple-touch-icon.png" alt="Local Share" class="about-logo" />
          </div>
          <div class="about-hero-title">Local Share (LoS)</div>
          <div class="about-hero-version">v3.1 &bull; WebRTC P2P</div>
          <p class="about-hero-desc">${t('about.subtitle')}</p>
        </div>

        <div class="about-links-grid">
          <a href="https://github.com/trchicuong/local-share" target="_blank" rel="noopener noreferrer" class="about-link-card" id="about-github-link">
            <div class="about-link-icon github-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </div>
            <div class="about-link-info">
              <span class="about-link-title">${t('about.github')}</span>
              <span class="about-link-desc">${t('about.githubDesc')}</span>
            </div>
            <div class="about-link-chevron">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </a>

          <a href="https://sponsor.trchicuong.id.vn/" target="_blank" rel="noopener noreferrer" class="about-link-card" id="about-sponsor-link">
            <div class="about-link-icon sponsor-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
              </svg>
            </div>
            <div class="about-link-info">
              <span class="about-link-title">${t('about.sponsor')}</span>
              <span class="about-link-desc">${t('about.sponsorDesc')}</span>
            </div>
            <div class="about-link-chevron">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </a>

          <a href="https://github.com/trchicuong/local-share#readme" target="_blank" rel="noopener noreferrer" class="about-link-card" id="about-faq-link">
            <div class="about-link-icon faq-icon">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div class="about-link-info">
              <span class="about-link-title">${t('about.faq')}</span>
              <span class="about-link-desc">${t('about.faqDesc')}</span>
            </div>
            <div class="about-link-chevron">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </div>
          </a>
        </div>

        <div class="settings-footer about-footer">
          <span>Created with <svg class="footer-heart-icon" viewBox="0 0 24 24" width="14" height="14" fill="#ef4444" style="vertical-align: -1px; display: inline-block;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> by <strong style="color: #ffffff; font-weight: 600;">trchicuong</strong></span>
        </div>
      </div>
    `;

    document.getElementById('about-close-btn')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());
  }

  close() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}

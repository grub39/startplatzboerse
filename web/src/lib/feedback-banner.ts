const ICONS = {
    error: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`,
};

function showFeedback(el: HTMLElement | null, type: 'error' | 'success', message: string) {
    if (!el) return;

    el.classList.remove('is-error', 'is-success');
    el.classList.add(type === 'error' ? 'is-error' : 'is-success');

    const icon = el.querySelector('.feedback-banner__icon');
    const text = el.querySelector('.feedback-banner__text');

    if (icon) icon.innerHTML = ICONS[type];
    if (text) text.textContent = message;

    el.hidden = false;

    el.style.animation = 'none';
    void el.offsetHeight;
    el.style.removeProperty('animation');

    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function showFeedbackError(el: HTMLElement | null, message: string) {
    showFeedback(el, 'error', message);
}

export function showFeedbackSuccess(el: HTMLElement | null, message: string) {
    showFeedback(el, 'success', message);
}

export function hideFeedback(el: HTMLElement | null) {
    if (!el) return;
    el.hidden = true;
    el.classList.remove('is-error', 'is-success');
}

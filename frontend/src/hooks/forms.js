export function notify(message, error = false) {
    const root = document.querySelector('#notice');
    root.textContent = message;
    root.classList.toggle('notice-error', error);
}

export function submitForm(selector, handler) {
    const form = document.querySelector(selector);
    form?.addEventListener('submit', async event => {
        event.preventDefault();
        const button = event.submitter;
        const error = form.querySelector('.form-error');
        button.disabled = true;
        error.textContent = '';
        try {
            await handler(Object.fromEntries(new FormData(form)));
        } catch (err) {
            error.textContent = err.message;
        } finally {
            button.disabled = false;
        }
    });
}

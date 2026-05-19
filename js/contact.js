const form = document.getElementById('contactForm');

function getApiBaseUrl() {
  const { protocol, hostname, port } = window.location;

  if (protocol === 'file:') {
    return 'http://localhost:3000';
  }

  if (
    (hostname === 'localhost' || hostname === '127.0.0.1') &&
    port &&
    port !== '3000'
  ) {
    return `${window.location.protocol}//${hostname}:3000`;
  }

  return '';
}

if (form) {
  const statusNode = document.getElementById('formStatus');
  const submitButton = form.querySelector('button[type="submit"]');
  const apiBaseUrl = getApiBaseUrl();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = 'Sending...';
    statusNode.textContent = '';

    const payload = {
      name: document.getElementById('name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      message: document.getElementById('message').value.trim(),
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'omit',
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Submission failed.');
      }

      statusNode.className = 'form-status success';
      statusNode.textContent = 'Thank you. Your consultation request has been sent successfully.';
      form.reset();
    } catch (error) {
      statusNode.className = 'form-status error';
      statusNode.textContent = 'Sorry, there was a problem sending your request. Please make sure the backend server is running on port 3000 and try again.';
      console.error(error);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Send request';
    }
  });
}

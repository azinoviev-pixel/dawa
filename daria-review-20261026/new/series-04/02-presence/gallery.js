(() => {
  const dialog = document.querySelector('.property-gallery');
  if (!dialog) return;
  const photo = document.getElementById('gallery-photo');
  const caption = document.getElementById('gallery-caption');
  const number = document.getElementById('gallery-number');
  const close = dialog.querySelector('[data-close-gallery]');
  const frames = [
    ['assets/images/mediterranean-loggia-v1.png', 'Концептуальная иллюстрация лоджии у моря', 'Лоджия у моря — концептуальная иллюстрация'],
    ['assets/images/barcelona-threshold-v1.png', 'Концептуальная иллюстрация интерьера в Барселоне', 'Интерьер в Барселоне — концептуальная иллюстрация'],
    ['assets/images/white-courtyard-v1.png', 'Концептуальная иллюстрация белого двора', 'Белый двор — концептуальная иллюстрация']
  ];
  let current = 0;
  let opener = null;
  const show = index => {
    current = (index + frames.length) % frames.length;
    const [src, alt, text] = frames[current];
    photo.src = src;
    photo.alt = alt;
    caption.textContent = text;
    number.textContent = `${current + 1} / ${frames.length}`;
  };
  document.querySelectorAll('[data-open-gallery]').forEach(button => button.addEventListener('click', () => {
    opener = button;
    dialog.showModal();
    close.focus();
  }));
  close.addEventListener('click', () => dialog.close());
  dialog.querySelector('[data-prev-gallery]').addEventListener('click', () => show(current - 1));
  dialog.querySelector('[data-next-gallery]').addEventListener('click', () => show(current + 1));
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') show(current + 1);
    if (event.key === 'ArrowLeft') show(current - 1);
  });
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => opener?.focus());
})();

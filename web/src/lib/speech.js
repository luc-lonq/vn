/** Reads text aloud with the browser's Vietnamese voice, if one is installed. */
export function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'vi-VN';
  utterance.rate = 0.85;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
  if (voice) utterance.voice = voice;

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

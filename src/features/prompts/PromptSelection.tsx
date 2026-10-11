import { useState } from 'react';
import type { Prompt } from '../../domain/game/types';
import { promptPackName, prompts } from '../../data/prompts/promptCatalog';

export function PromptSelection({ onChoose, onBack }: { onChoose: (prompt: Prompt) => void; onBack: () => void }) {
  const [selected, setSelected] = useState(prompts[0].id);
  const [custom, setCustom] = useState('');
  const prompt = prompts.find((item) => item.id === selected)!;
  const begin = () => onChoose({ ...prompt, lowLabel: prompt.lowLabel || 'Low', highLabel: prompt.highLabel || 'High' });
  const startCustom = () => {
    const text = custom.trim();
    if (text) onChoose({ id: `custom-${crypto.randomUUID()}`, text, lowLabel: 'Not at all', highLabel: 'Absolutely' });
  };
  return <section className="setup-form">
    <div className="form-heading"><div><span className="eyebrow">SET THE SCENE</span><h1>Choose your prompt.</h1><p>Everyone’s clue should fit somewhere on this spectrum.</p></div><span className="step-chip">02 <i>/ 03</i></span></div>
    <div className="prompt-preview"><span className="tiny-label">TONIGHT’S QUESTION</span><h2>{prompt.text}</h2><div className="preview-scale"><span>{prompt.lowLabel}</span><div><i /><i /><i /><i /><i /></div><span>{prompt.highLabel}</span></div></div>
    <label className="field-label" htmlFor="prompt-select">PROMPT PACK · {promptPackName.toUpperCase()}</label>
    <select id="prompt-select" className="select-field" value={selected} onChange={(event) => setSelected(event.target.value)}>{prompts.map((item) => <option key={item.id} value={item.id}>{item.category} · {item.text}</option>)}</select>
    <details className="custom-prompt"><summary>Write your own prompt</summary><div className="custom-row"><input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="e.g. How chaotic is this pet?" maxLength={120} /><button type="button" className="button button-secondary" onClick={startCustom} disabled={!custom.trim()}>Use this</button></div></details>
    <div className="form-footer"><button type="button" className="text-button" onClick={onBack}>← Back to players</button><button className="button button-primary" type="button" onClick={begin}>Deal the numbers <span>→</span></button></div>
  </section>;
}

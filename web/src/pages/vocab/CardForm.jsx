import { useId, useRef, useState } from 'react';

const EMPTY = { front: '', back: '', example: '', tags: '' };

const FIELDS = [
  { name: 'front', label: 'vietnamien', className: 'text-base' },
  { name: 'back', label: 'français', className: 'text-base' },
  { name: 'example', label: 'exemple (optionnel)' },
  { name: 'tags', label: 'tags (optionnel)', placeholder: 'nourriture, leçon-3' },
];

/** Create form when `initial` is omitted, edit form otherwise. */
export default function CardForm({ initial, onSubmit, onCancel, submitLabel }) {
  const isEdit = Boolean(initial);
  const [values, setValues] = useState(initial ?? EMPTY);
  const [error, setError] = useState('');
  const firstInput = useRef(null);
  const idPrefix = useId(); // unique per form: create and edit forms can coexist

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await onSubmit(values);
      if (!isEdit) {
        setValues(EMPTY);
        firstInput.current?.focus();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const canSubmit = values.front.trim() && values.back.trim();

  return (
    <form onSubmit={submit} className="grid md:grid-cols-2 gap-3">
      {FIELDS.map((field, i) => (
        <div key={field.name}>
          <label className="label" htmlFor={`${idPrefix}-${field.name}`}>
            {field.label}
          </label>
          <input
            id={`${idPrefix}-${field.name}`}
            ref={i === 0 ? firstInput : undefined}
            className={`input ${field.className ?? ''}`}
            placeholder={field.placeholder}
            autoFocus={isEdit && i === 0}
            value={values[field.name]}
            onChange={(e) => setValues({ ...values, [field.name]: e.target.value })}
          />
        </div>
      ))}
      <div className="md:col-span-2 flex items-center gap-2 justify-end">
        {error && <span className="text-sm mr-auto">{error}</span>}
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            annuler
          </button>
        )}
        <button className="btn-primary" disabled={!canSubmit}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

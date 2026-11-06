import React, { useCallback, useState } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from '../utils/cropImage';
import ConfirmDialog from './ConfirmDialog';

// Square photo crop for speaker and Hall of Fame photos.
export default function PhotoCropper({ src, onDone, onCancel, title = 'Crop speaker photo', round = true }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 }), [zoom, setZoom] = useState(1), [area, setArea] = useState(null), [error, setError] = useState('');
  const onComplete = useCallback((_, pixels) => setArea(pixels), []);
  async function save() {
    try { onDone(await getCroppedImg(src, area)); }
    catch { setError('We could not crop this image. Please choose it again and retry.'); }
  }
  return <ConfirmDialog title={title} confirmLabel="Use photo" cancelLabel="Cancel" disabled={!area} error={error} onCancel={onCancel} onConfirm={save}>
    <div className="relative h-72 w-full overflow-hidden rounded-xl bg-slate-900"><Cropper image={src} crop={crop} zoom={zoom} aspect={1} cropShape={round ? 'round' : 'rect'} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete}/></div>
    <label className="block text-xs font-semibold text-slate-600">Zoom<input type="range" min={1} max={3} step={0.05} value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="mt-1 w-full accent-dos"/></label>
  </ConfirmDialog>;
}

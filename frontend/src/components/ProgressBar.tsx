export default function ProgressBar({ show, text, percent }: { show: boolean; text: string; percent: number }) {
  return (
    <div id="progressBar" className={show ? 'show' : ''}>
      <div className="progress-info">
        <div className="spinner"></div>
        <span>{text}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${percent}%` }}></div>
      </div>
    </div>
  );
}

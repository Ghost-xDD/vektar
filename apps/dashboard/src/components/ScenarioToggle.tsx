import { useDemoStore, type DemoScenario } from '../lib/demo-store';

export function ScenarioToggle() {
  const { scenario, setScenario } = useDemoStore();

  const scenarios: { value: DemoScenario; label: string; color: string }[] = [
    { value: 'normal', label: 'Live', color: '#10b981' },
    { value: 'thin', label: 'Thin', color: '#f59e0b' },
    { value: 'crisis', label: 'Crisis', color: '#ef4444' },
  ];

  return (
    <div className="flex items-center gap-1.5 opacity-20 hover:opacity-60 transition-opacity">
      {scenarios.map(({ value, label, color }) => (
        <button
          key={value}
          onClick={() => setScenario(value)}
          className={`
            w-1.5 h-1.5 rounded-full transition-all
            ${scenario === value ? 'scale-150' : 'scale-100 hover:scale-125'}
          `}
          style={{ 
            backgroundColor: scenario === value ? color : '#4b5563',
          }}
          title={`Switch to ${label} scenario`}
          aria-label={`Switch to ${label} scenario`}
        />
      ))}
    </div>
  );
}

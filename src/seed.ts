import type { Workspace } from './model';

export const initialWorkspace: Workspace = {
  theme: 'light',
  projects: [
    { id: 'orbit', title: 'Orbit API', description: 'Core backend services and API gateway for the Orbit platform.', status: 'In Progress', tags: ['Node.js', 'TypeScript'], path: '', updatedAt: '2026-06-18T10:00:00.000Z' },
    { id: 'sensor', title: 'Sensor Node', description: 'Low-power environmental telemetry for the lab workspace.', status: 'Testing', tags: ['ESP32', 'C'], path: '', updatedAt: '2026-06-17T10:00:00.000Z' },
    { id: 'studio', title: 'Studio Web', description: 'Public-facing portfolio and component library.', status: 'Deployed', tags: ['React', 'Tailwind CSS'], path: '', updatedAt: '2026-06-16T10:00:00.000Z' },
    { id: 'pipeline', title: 'Data Pipeline', description: 'Automated ingestion and validation for lab datasets.', status: 'On Hold', tags: ['Python', 'Docker'], path: '', updatedAt: '2026-06-15T10:00:00.000Z' },
  ],
  snippets: [
    { id: 'git', title: 'Undo last commit', category: 'Git', content: 'git reset --soft HEAD~1', updatedAt: '2026-06-18T09:00:00.000Z' },
    { id: 'flash', title: 'Flash ESP32 firmware', category: 'Firmware', content: 'idf.py -p PORT flash monitor', updatedAt: '2026-06-17T09:00:00.000Z' },
    { id: 'docker', title: 'Restart local services', category: 'Docker', content: 'docker compose restart', updatedAt: '2026-06-16T09:00:00.000Z' },
  ],
  notes: [
    { id: 'retry', projectId: 'orbit', title: 'API retry strategy', topic: 'Architecture', content: '## Decision\n\nUse exponential backoff with jitter for transient errors.\n\n- Retry idempotent requests only.\n- Keep the retry budget below the caller timeout.\n- Log the final failure once.', updatedAt: '2026-06-18T08:00:00.000Z' },
    { id: 'battery', projectId: 'sensor', title: 'Battery drain investigation', topic: 'Debugging', content: '## Observation\n\nThe LED stayed on after the radio entered deep sleep.\n\n## Next test\n\nMeasure idle current with the LED disconnected.', updatedAt: '2026-06-17T08:00:00.000Z' },
    { id: 'deploy', projectId: 'studio', title: 'Deployment checklist', topic: 'Release', content: '## Before deployment\n\n- [ ] Run the production build\n- [ ] Verify both color themes\n- [ ] Check the release preview', updatedAt: '2026-06-16T08:00:00.000Z' },
  ],
};

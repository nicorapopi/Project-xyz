import { Activity, ArrowRight, ChevronRight, FileText, Folder, Plus, Terminal } from 'lucide-react';
import { Empty, PanelHeader, ProjectIcon, StatusBadge, Tags } from './components';
import { displayDate, updatedFirst, type Note, type Project, type Workspace } from './model';
import { arrowFocus } from './useList';

export function Overview({ workspace, onProjects, onActiveProjects, onSnippets, onNotes, onAdd, onProject, onNote }: {
  workspace: Workspace; onProjects: () => void; onActiveProjects: () => void; onSnippets: () => void; onNotes: () => void;
  onAdd: () => void; onProject: (project: Project) => void; onNote: (note: Note) => void;
}) {
  const active = workspace.projects.filter((project) => project.status === 'In Progress' || project.status === 'Testing').length;
  const stats = [
    { label: 'Total projects', count: workspace.projects.length, icon: Folder, color: 'blue', action: onProjects },
    { label: 'Active projects', count: active, icon: Activity, color: 'green', action: onActiveProjects },
    { label: 'Saved snippets', count: workspace.snippets.length, icon: Terminal, color: 'purple', action: onSnippets },
    { label: 'Lab notes', count: workspace.notes.length, icon: FileText, color: 'amber', action: onNotes },
  ];

  return <>
    <div className="page-heading mb-6"><h1>Overview</h1><p>Here’s what’s happening across your workspace.</p></div>
    <section className="hero" aria-labelledby="welcome-title">
      <div className="hero-art" aria-hidden="true">
        <div className="wire-grid" />
        <div className="stack stack-main"><i /><i /><i /></div>
        <div className="stack stack-small"><i /><i /><i /></div>
        <span className="hero-spark spark-one">+</span><span className="hero-spark spark-two">+</span><span className="hero-spark spark-three">+</span>
        <span className="hero-coordinate coord-one" /><span className="hero-coordinate coord-two" />
      </div>
      <div className="hero-content">
        <h2 id="welcome-title">Welcome to NexaDesk</h2>
        <p>A home for your projects, commands, and lab notes.</p>
        <button className="button hero-button" onClick={onAdd}><Plus size={16} /> New project</button>
      </div>
    </section>
    <section className="stats-grid" aria-label="Workspace stats">
      {stats.map(({ label, count, icon: Icon, color, action }) => <button className="stat surface" key={label} onClick={action}>
        <span className={`item-icon ${color}`}><Icon size={17} /></span><span className="stat-label">{label}</span>
        <strong>{count}</strong>
      </button>)}
    </section>
    <div className="overview-panels">
      <section className="surface recent-panel" onKeyDown={arrowFocus}>
        <PanelHeader title="Recent projects" icon={Folder} onView={onProjects} />
        {workspace.projects.length ? updatedFirst(workspace.projects).slice(0, 4).map((project) => <button data-list-entry className="project-row" key={project.id} onClick={() => onProject(project)}>
          <ProjectIcon id={project.id} />
          <div className="row-title"><strong>{project.title}</strong><Tags tags={project.tags} /></div>
          <StatusBadge status={project.status} /><ChevronRight className="row-chevron" size={16} />
        </button>) : <Empty title="No projects yet" text="Add a project to see it here." action={<button className="text-button" onClick={onAdd}>New project <ArrowRight size={14} /></button>} />}
      </section>
      <section className="surface recent-panel" onKeyDown={arrowFocus}>
        <PanelHeader title="Recent notes" icon={FileText} onView={onNotes} />
        {workspace.notes.length ? updatedFirst(workspace.notes).slice(0, 3).map((note) => {
          const project = workspace.projects.find((item) => item.id === note.projectId);
          return <button data-list-entry className="note-row" key={note.id} onClick={() => onNote(note)}>
            <span className="item-icon neutral"><FileText size={17} /></span>
            <div className="row-title"><strong>{note.title}</strong><span className="row-subtitle">{[project?.title, note.topic].filter(Boolean).join(' · ') || 'General note'}</span></div>
            <time className="short-date" dateTime={note.updatedAt}>{displayDate(note.updatedAt)}</time>
          </button>;
        }) : <Empty icon={FileText} title="No notes yet" text="Start a note from the Notes tab." />}
      </section>
    </div>
  </>;
}

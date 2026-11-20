import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';
import { webUrl } from './schema';
import { desktop } from './storage';

export default memo(function NoteMarkdown({ content, onLink }: { content: string; onLink: (url: string) => void }) {
  return <div className="markdown"><Markdown skipHtml remarkPlugins={[remarkGfm]} components={{
    img: ({ alt }) => <span>{alt}</span>,
    a: ({ href, children }) => {
      const url = href ? webUrl(href) : null;
      if (!url) return <span>{children}</span>;
      if (desktop) return <button type="button" className="note-link" onClick={() => onLink(url)}>{children}</button>;
      return <a href={url} target="_blank" rel="noreferrer noopener">{children}</a>;
    },
  }}>{content}</Markdown></div>;
});

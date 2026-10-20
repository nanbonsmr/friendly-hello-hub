import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import Image from "@tiptap/extension-image";
import { TableKit } from "@tiptap/extension-table";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Placeholder, CharacterCount } from "@tiptap/extensions";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { useEffect, useRef, useState } from "react";
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Code2, Eraser, Highlighter, ImagePlus, Indent, Italic,
  Link2, List, ListChecks, ListOrdered, Maximize2, Minimize2, Minus, Outdent, Printer, Quote, Redo2, Search,
  Strikethrough, Subscript as SubIcon, Superscript as SupIcon, Table as TableIcon, Underline, Undo2, Baseline,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Convert legacy plain-text chapters into paragraphs. */
export function toHtml(s: string) {
  if (!s) return "";
  if (/<\/?[a-z][\s\S]*>/i.test(s)) return s;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return s.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

const FONTS = ["Default", "Georgia", "Times New Roman", "Garamond", "Arial", "Helvetica", "Verdana", "Courier New", "Noto Serif Ethiopic"];
const SIZES = ["12px", "14px", "16px", "18px", "20px", "24px", "28px", "32px", "40px"];
const COLORS = ["#000000", "#434343", "#666666", "#c00000", "#e06666", "#e69138", "#f1c232", "#6aa84f", "#3d85c6", "#674ea7", "#a64d79", "#ffffff"];
const MAX_IMG_MB = 2;

export function RichEditor({ value, onChange, editable = true }: { value: string; onChange: (html: string) => void; editable?: boolean }) {
  const [full, setFull] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TextStyle, Color, FontFamily, FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ allowBase64: true }),
      TableKit.configure({ table: { resizable: true } }),
      TaskList, TaskItem.configure({ nested: true }),
      Subscript, Superscript,
      Placeholder.configure({ placeholder: "Start writing your chapter…" }),
      CharacterCount,
    ],
    content: toHtml(value),
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => { editor?.setEditable(editable); }, [editor, editable]);

  return (
    <div className={cn("doc-shell flex flex-col overflow-hidden rounded-lg border bg-muted/40", full && "fixed inset-0 z-50 rounded-none")}>
      {editor && editable && <Toolbar editor={editor} full={full} setFull={setFull} />}
      <div className={cn("overflow-y-auto px-4 py-8", full ? "flex-1" : "max-h-[75vh] min-h-[60vh]")}>
        <div className="mx-auto max-w-[816px] rounded-sm bg-background shadow-md">
          <EditorContent editor={editor} className="doc-editor" />
        </div>
      </div>
      {editor && (
        <div className="flex justify-between border-t bg-background px-4 py-1.5 text-xs text-muted-foreground">
          <span>{editor.storage.characterCount.words()} words · {editor.storage.characterCount.characters()} characters</span>
          <span>~{Math.max(1, Math.round(editor.storage.characterCount.words() / 230))} min read</span>
        </div>
      )}
    </div>
  );
}

function Btn({ on, active, title, children, disabled }: { on: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={on}
      className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 text-sm hover:bg-accent disabled:opacity-40", active && "bg-accent text-accent-foreground")}>
      {children}
    </button>
  );
}
const Sep = () => <span className="mx-1 h-6 w-px bg-border" />;

function Toolbar({ editor, full, setFull }: { editor: Editor; full: boolean; setFull: (v: boolean) => void }) {
  const imgRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    editor.on("transaction", f);
    return () => { editor.off("transaction", f); };
  }, [editor]);
  const ch = () => editor.chain().focus();
  const block = editor.isActive("heading", { level: 1 }) ? "h1" : editor.isActive("heading", { level: 2 }) ? "h2" : editor.isActive("heading", { level: 3 }) ? "h3" : editor.isActive("heading", { level: 4 }) ? "h4" : "p";
  const style = editor.getAttributes("textStyle") as { fontFamily?: string; fontSize?: string };

  function setBlock(v: string) {
    if (v === "p") ch().setParagraph().run();
    else ch().toggleHeading({ level: Number(v[1]) as 1 | 2 | 3 | 4 }).run();
  }
  function link() {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL (leave empty to remove)", prev ?? "https://");
    if (url === null) return;
    if (!url) ch().extendMarkRange("link").unsetLink().run();
    else ch().extendMarkRange("link").setLink({ href: url }).run();
  }
  function pickImage(f?: File) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Choose an image file."); return; }
    if (f.size > MAX_IMG_MB * 1024 * 1024) { toast.error(`Image must be under ${MAX_IMG_MB} MB.`); return; }
    const r = new FileReader();
    r.onload = () => ch().setImage({ src: String(r.result), alt: f.name }).run();
    r.readAsDataURL(f);
  }
  function print() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Print</title><style>body{font-family:Georgia,serif;max-width:700px;margin:40px auto;line-height:1.7}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}</style></head><body>${editor.getHTML()}</body></html>`);
    w.document.close(); w.focus(); w.print();
  }

  const sel = "h-8 rounded border bg-background px-1.5 text-sm";
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b bg-background px-2 py-1.5">
      <Btn title="Undo (Ctrl+Z)" on={() => ch().undo().run()} disabled={!editor.can().undo()}><Undo2 className="h-4 w-4" /></Btn>
      <Btn title="Redo (Ctrl+Y)" on={() => ch().redo().run()} disabled={!editor.can().redo()}><Redo2 className="h-4 w-4" /></Btn>
      <Btn title="Print" on={print}><Printer className="h-4 w-4" /></Btn>
      <Sep />
      <select aria-label="Text style" className={sel} value={block} onChange={(e) => setBlock(e.target.value)}>
        <option value="p">Normal text</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="h4">Heading 4</option>
      </select>
      <select aria-label="Font" className={cn(sel, "w-32")} value={style.fontFamily ?? "Default"} onChange={(e) => e.target.value === "Default" ? ch().unsetFontFamily().run() : ch().setFontFamily(e.target.value).run()}>
        {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select aria-label="Font size" className={sel} value={style.fontSize ?? ""} onChange={(e) => e.target.value ? ch().setFontSize(e.target.value).run() : ch().unsetFontSize().run()}>
        <option value="">Size</option>
        {SIZES.map((s) => <option key={s} value={s}>{s.replace("px", "")}</option>)}
      </select>
      <Sep />
      <Btn title="Bold (Ctrl+B)" active={editor.isActive("bold")} on={() => ch().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
      <Btn title="Italic (Ctrl+I)" active={editor.isActive("italic")} on={() => ch().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
      <Btn title="Underline (Ctrl+U)" active={editor.isActive("underline")} on={() => ch().toggleUnderline().run()}><Underline className="h-4 w-4" /></Btn>
      <Btn title="Strikethrough" active={editor.isActive("strike")} on={() => ch().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
      <Btn title="Subscript" active={editor.isActive("subscript")} on={() => ch().toggleSubscript().run()}><SubIcon className="h-4 w-4" /></Btn>
      <Btn title="Superscript" active={editor.isActive("superscript")} on={() => ch().toggleSuperscript().run()}><SupIcon className="h-4 w-4" /></Btn>
      <ColorPick title="Text color" icon={<Baseline className="h-4 w-4" />} onPick={(c) => c ? ch().setColor(c).run() : ch().unsetColor().run()} />
      <ColorPick title="Highlight" icon={<Highlighter className="h-4 w-4" />} onPick={(c) => c ? ch().setHighlight({ color: c }).run() : ch().unsetHighlight().run()} />
      <Sep />
      <Btn title="Align left" active={editor.isActive({ textAlign: "left" })} on={() => ch().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></Btn>
      <Btn title="Align center" active={editor.isActive({ textAlign: "center" })} on={() => ch().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></Btn>
      <Btn title="Align right" active={editor.isActive({ textAlign: "right" })} on={() => ch().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></Btn>
      <Btn title="Justify" active={editor.isActive({ textAlign: "justify" })} on={() => ch().setTextAlign("justify").run()}><AlignJustify className="h-4 w-4" /></Btn>
      <Sep />
      <Btn title="Bulleted list" active={editor.isActive("bulletList")} on={() => ch().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
      <Btn title="Numbered list" active={editor.isActive("orderedList")} on={() => ch().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
      <Btn title="Checklist" active={editor.isActive("taskList")} on={() => ch().toggleTaskList().run()}><ListChecks className="h-4 w-4" /></Btn>
      <Btn title="Increase indent" on={() => ch().sinkListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run()}><Indent className="h-4 w-4" /></Btn>
      <Btn title="Decrease indent" on={() => ch().liftListItem(editor.isActive("taskItem") ? "taskItem" : "listItem").run()}><Outdent className="h-4 w-4" /></Btn>
      <Sep />
      <Btn title="Quote" active={editor.isActive("blockquote")} on={() => ch().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
      <Btn title="Code block" active={editor.isActive("codeBlock")} on={() => ch().toggleCodeBlock().run()}><Code2 className="h-4 w-4" /></Btn>
      <Btn title="Divider line" on={() => ch().setHorizontalRule().run()}><Minus className="h-4 w-4" /></Btn>
      <Btn title="Link" active={editor.isActive("link")} on={link}><Link2 className="h-4 w-4" /></Btn>
      <Btn title="Insert image" on={() => imgRef.current?.click()}><ImagePlus className="h-4 w-4" /></Btn>
      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickImage(e.target.files?.[0]); e.target.value = ""; }} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><button type="button" title="Table" className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded px-1.5 hover:bg-accent", editor.isActive("table") && "bg-accent")}><TableIcon className="h-4 w-4" /></button></DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => ch().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Insert 3×3 table</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().addRowAfter().run()}>Add row below</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().addColumnAfter().run()}>Add column right</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().deleteRow().run()}>Delete row</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().deleteColumn().run()}>Delete column</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().mergeOrSplit().run()}>Merge / split cells</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} onClick={() => ch().toggleHeaderRow().run()}>Toggle header row</DropdownMenuItem>
          <DropdownMenuItem disabled={!editor.isActive("table")} className="text-destructive" onClick={() => ch().deleteTable().run()}>Delete table</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Sep />
      <FindReplace editor={editor} />
      <Btn title="Clear formatting" on={() => ch().unsetAllMarks().clearNodes().run()}><Eraser className="h-4 w-4" /></Btn>
      <Btn title={full ? "Exit full screen" : "Full screen"} on={() => setFull(!full)}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</Btn>
    </div>
  );
}

function ColorPick({ title, icon, onPick }: { title: string; icon: React.ReactNode; onPick: (c: string | null) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" title={title} aria-label={title} className="inline-flex h-8 min-w-8 items-center justify-center rounded hover:bg-accent">{icon}</button></PopoverTrigger>
      <PopoverContent className="w-auto p-2">
        <div className="grid grid-cols-6 gap-1">
          {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => onPick(c)} className="h-6 w-6 rounded border" style={{ background: c }} />)}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <input type="color" aria-label="Custom color" onChange={(e) => onPick(e.target.value)} className="h-7 w-10" />
          <Button size="sm" variant="ghost" onClick={() => onPick(null)}>None</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FindReplace({ editor }: { editor: Editor }) {
  const [find, setFind] = useState("");
  const [rep, setRep] = useState("");
  function count() {
    if (!find) return 0;
    return editor.getText().split(find).length - 1;
  }
  function replaceAll() {
    if (!find) return;
    const { state } = editor;
    const tr = state.tr;
    const hits: { from: number; to: number }[] = [];
    state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      let i = node.text.indexOf(find);
      while (i !== -1) { hits.push({ from: pos + i, to: pos + i + find.length }); i = node.text.indexOf(find, i + find.length); }
    });
    hits.reverse().forEach((h) => { if (rep) tr.insertText(rep, h.from, h.to); else tr.delete(h.from, h.to); });
    editor.view.dispatch(tr);
    toast.success(`Replaced ${hits.length} match${hits.length === 1 ? "" : "es"}`);
  }
  return (
    <Popover>
      <PopoverTrigger asChild><button type="button" title="Find and replace" aria-label="Find and replace" className="inline-flex h-8 min-w-8 items-center justify-center rounded hover:bg-accent"><Search className="h-4 w-4" /></button></PopoverTrigger>
      <PopoverContent className="w-72 space-y-2">
        <Input placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} />
        <Input placeholder="Replace with" value={rep} onChange={(e) => setRep(e.target.value)} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{count()} matches</span>
          <Button size="sm" onClick={replaceAll} disabled={!find}>Replace all</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

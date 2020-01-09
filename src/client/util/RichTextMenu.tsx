import React = require("react");
import AntimodeMenu from "../views/AntimodeMenu";
import { observable, action, } from "mobx";
import { observer } from "mobx-react";
import { Mark, MarkType, Node as ProsNode, NodeType, ResolvedPos, Schema } from "prosemirror-model";
import { schema } from "./RichTextSchema";
import { EditorView } from "prosemirror-view";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faBold, faItalic, faUnderline, faStrikethrough, faSubscript, faSuperscript, faIndent, faEyeDropper, faCaretDown, faPalette, faHighlighter, faLink, faPaintRoller } from "@fortawesome/free-solid-svg-icons";
import { MenuItem, Dropdown } from "prosemirror-menu";
import { updateBullets } from "./ProsemirrorExampleTransfer";
import { FieldViewProps } from "../views/nodes/FieldView";
import { NumCast, Cast, StrCast } from "../../new_fields/Types";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";
import { unimplementedFunction, Utils } from "../../Utils";
import { wrapInList } from "prosemirror-schema-list";
import { PastelSchemaPalette, DarkPastelSchemaPalette } from '../../new_fields/SchemaHeaderField';
import "./RichTextMenu.scss";
import { DocServer } from "../DocServer";
import { Doc } from "../../new_fields/Doc";
import { SelectionManager } from "./SelectionManager";
import { LinkManager } from "./LinkManager";
const { toggleMark, setBlockType } = require("prosemirror-commands");

library.add(faBold, faItalic, faUnderline, faStrikethrough, faSuperscript, faSubscript, faIndent, faEyeDropper, faCaretDown, faPalette, faHighlighter, faLink, faPaintRoller);

@observer
export default class RichTextMenu extends AntimodeMenu {
    static Instance: RichTextMenu;
    public overMenu: boolean = false; // kind of hacky way to prevent selects not being selectable

    private view?: EditorView;
    private editorProps: FieldViewProps & FormattedTextBoxProps | undefined;

    @observable private activeFontSize: string = "";
    @observable private activeFontFamily: string = "";
    @observable private activeListType: string = "";

    @observable private brushIsEmpty: boolean = true;
    @observable private brushMarks: Set<Mark> = new Set();
    @observable private showBrushDropdown: boolean = false;

    @observable private activeFontColor: string = "black";
    @observable private showColorDropdown: boolean = false;

    @observable private activeHighlightColor: string = "transparent";
    @observable private showHighlightDropdown: boolean = false;

    @observable private currentLink: string | undefined = "";
    @observable private showLinkDropdown: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        RichTextMenu.Instance = this;
        this._canFade = false;
    }

    @action
    changeView(view: EditorView) {
        this.view = view;
    }

    update(view: EditorView, lastState: EditorState | undefined) {
        this.updateFromDash(view, lastState, this.editorProps);
    }

    @action
    public async updateFromDash(view: EditorView, lastState: EditorState | undefined, props: any) {
        if (!view) {
            console.log("no editor?  why?");
            return;
        }
        this.view = view;
        const state = view.state;
        // DocumentDecorations.Instance.showTextBar();
        props && (this.editorProps = props);
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection)) return;

        // this.reset_mark_doms();

        // update active font family and size
        const active = this.getActiveFontStylesOnSelection();
        const activeFamilies = active && active.get("families");
        const activeSizes = active && active.get("sizes");

        console.log("update from dash, activefontsize", this.activeFontSize, activeSizes, activeSizes && activeSizes.length, activeSizes && String(activeSizes[0]));
        this.activeFontFamily = !activeFamilies || activeFamilies.length === 0 ? "Arial" : activeFamilies.length === 1 ? String(activeFamilies[0]) : "various";
        this.activeFontSize = !activeSizes || activeSizes.length === 0 ? "13pt" : activeSizes.length === 1 ? String(activeSizes[0]) + "pt" : "various";

        // update link in current selection
        const targetTitle = await this.getTextLinkTargetTitle();
        this.setCurrentLink(targetTitle);

        // this.update_mark_doms();
    }

    setMark = (mark: Mark, state: EditorState<any>, dispatch: any) => {
        if (mark) {
            const node = (state.selection as NodeSelection).node;
            if (node ?.type === schema.nodes.ordered_list) {
                let attrs = node.attrs;
                if (mark.type === schema.marks.pFontFamily) attrs = { ...attrs, setFontFamily: mark.attrs.family };
                if (mark.type === schema.marks.pFontSize) attrs = { ...attrs, setFontSize: mark.attrs.fontSize };
                if (mark.type === schema.marks.pFontColor) attrs = { ...attrs, setFontColor: mark.attrs.color };
                const tr = updateBullets(state.tr.setNodeMarkup(state.selection.from, node.type, attrs), state.schema);
                dispatch(tr.setSelection(new NodeSelection(tr.doc.resolve(state.selection.from))));
            } else {
                toggleMark(mark.type, mark.attrs)(state, (tx: any) => {
                    const { from, $from, to, empty } = tx.selection;
                    if (!tx.doc.rangeHasMark(from, to, mark.type)) {
                        toggleMark(mark.type, mark.attrs)({ tr: tx, doc: tx.doc, selection: tx.selection, storedMarks: tx.storedMarks }, dispatch);
                    } else dispatch(tx);
                });
            }
        }
    }

    // finds font sizes and families in selection
    getActiveFontStylesOnSelection() {
        if (!this.view) return;

        const activeFamilies: string[] = [];
        const activeSizes: string[] = [];
        const state = this.view.state;
        const pos = this.view.state.selection.$from;
        const ref_node = this.reference_node(pos);
        if (ref_node && ref_node !== this.view.state.doc && ref_node.isText) {
            ref_node.marks.forEach(m => {
                m.type === state.schema.marks.pFontFamily && activeFamilies.push(m.attrs.family);
                m.type === state.schema.marks.pFontSize && activeSizes.push(String(m.attrs.fontSize) + "pt");
            });
        }

        let styles = new Map<String, String[]>();
        styles.set("families", activeFamilies);
        styles.set("sizes", activeSizes);
        return styles;
    }

    getMarksInSelection(state: EditorState<any>) {
        const found = new Set<Mark>();
        const { from, to } = state.selection as TextSelection;
        state.doc.nodesBetween(from, to, (node) => node.marks ?.forEach(m => found.add(m)));
        return found;
    }

    destroy() {
    }

    createButton(faIcon: string, title: string, command?: any, onclick?: any) {
        const self = this;
        function onClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && command && command(self.view!.state, self.view!.dispatch, self.view);
            self.view && onclick && onclick(self.view!.state, self.view!.dispatch, self.view);
        }

        return (
            <button className="antimodeMenu-button" title={title} onPointerDown={onClick}>
                <FontAwesomeIcon icon={faIcon as IconProp} size="lg" />
            </button>
        );
    }

    createMarksDropdown(activeOption: string, options: { mark: Mark | null, title: string, label: string, command: (mark: Mark, view: EditorView) => void, hidden?: boolean }[]): JSX.Element {
        const items = options.map(({ title, label, hidden }) => {
            if (hidden) {
                return label === activeOption ?
                    <option value={label} title={title} selected hidden>{label}</option> :
                    <option value={label} title={title} hidden>{label}</option>;
            }
            return label === activeOption ?
                <option value={label} title={title} selected>{label}</option> :
                <option value={label} title={title}>{label}</option>;
        });

        const self = this;
        function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
            e.stopPropagation();
            e.preventDefault();
            console.log("on change marks");
            options.forEach(({ label, mark, command }) => {
                if (e.target.value === label) {
                    self.view && mark && command(mark, self.view);
                }
            });
        }
        return <select onChange={onChange}>{items}</select>;
    }

    createNodesDropdown(activeOption: string, options: { node: NodeType | any | null, title: string, label: string, command: (node: NodeType | any) => void, hidden?: boolean }[]): JSX.Element {
        const items = options.map(({ title, label, hidden }) => {
            if (hidden) {
                return label === activeOption ?
                    <option value={label} title={title} selected hidden>{label}</option> :
                    <option value={label} title={title} hidden>{label}</option>;
            }
            return label === activeOption ?
                <option value={label} title={title} selected>{label}</option> :
                <option value={label} title={title}>{label}</option>;
        });

        const self = this;
        function onChange(val: string) {
            options.forEach(({ label, node, command }) => {
                if (val === label) {
                    self.view && node && command(node);
                }
            });
        }
        return <select onChange={e => onChange(e.target.value)}>{items}</select>;
    }

    changeFontSize = (mark: Mark, view: EditorView) => {
        const size = mark.attrs.fontSize;
        if (this.editorProps) {
            const ruleProvider = this.editorProps.ruleProvider;
            const heading = NumCast(this.editorProps.Document.heading);
            if (ruleProvider && heading) {
                ruleProvider["ruleSize_" + heading] = size;
            }
        }
        this.setMark(view.state.schema.marks.pFontSize.create({ fontSize: size }), view.state, view.dispatch);
    }

    changeFontFamily = (mark: Mark, view: EditorView) => {
        const fontName = mark.attrs.family;
        // if (fontName) { this.updateFontStyleDropdown(fontName); }
        if (this.editorProps) {
            const ruleProvider = this.editorProps.ruleProvider;
            const heading = NumCast(this.editorProps.Document.heading);
            if (ruleProvider && heading) {
                ruleProvider["ruleFont_" + heading] = fontName;
            }
        }
        this.setMark(view.state.schema.marks.pFontFamily.create({ family: fontName }), view.state, view.dispatch);
    }

    // TODO: remove doesn't work
    //remove all node type and apply the passed-in one to the selected text
    changeListType = (nodeType: NodeType | undefined) => {
        if (!this.view) return;

        if (nodeType === schema.nodes.bullet_list) {
            wrapInList(nodeType)(this.view.state, this.view.dispatch);
        } else {
            const marks = this.view.state.storedMarks || (this.view.state.selection.$to.parentOffset && this.view.state.selection.$from.marks());
            if (!wrapInList(schema.nodes.ordered_list)(this.view.state, (tx2: any) => {
                const tx3 = updateBullets(tx2, schema, nodeType && (nodeType as any).attrs.mapStyle);
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);

                this.view!.dispatch(tx2);
            })) {
                const tx2 = this.view.state.tr;
                const tx3 = updateBullets(tx2, schema, nodeType && (nodeType as any).attrs.mapStyle);
                marks && tx3.ensureMarks([...marks]);
                marks && tx3.setStoredMarks([...marks]);

                this.view.dispatch(tx3);
            }
        }
    }

    insertSummarizer(state: EditorState<any>, dispatch: any) {
        if (state.selection.empty) return false;
        const mark = state.schema.marks.summarize.create();
        const tr = state.tr;
        tr.addMark(state.selection.from, state.selection.to, mark);
        const content = tr.selection.content();
        const newNode = state.schema.nodes.summary.create({ visibility: false, text: content, textslice: content.toJSON() });
        dispatch && dispatch(tr.replaceSelectionWith(newNode).removeMark(tr.selection.from - 1, tr.selection.from, mark));
        return true;
    }

    @action toggleBrushDropdown() { this.showBrushDropdown = !this.showBrushDropdown; }

    createBrushButton() {
        const self = this;
        function onBrushClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && self.fillBrush(self.view.state, self.view.dispatch);
        }
        function onDropdownClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.toggleBrushDropdown();
        }

        let label = "Stored marks: ";
        if (this.brushMarks && this.brushMarks.size > 0) {
            this.brushMarks.forEach((mark: Mark) => {
                const markType = mark.type;
                label += markType.name;
                label += ", ";
            });
            label = label.substring(0, label.length - 2);
        } else {
            label = "No marks are currently stored";
        }

        return (
            <div className="button-dropdown-wrapper">
                <button className="antimodeMenu-button" title="" onPointerDown={onBrushClick} style={this.brushMarks && this.brushMarks.size > 0 ? { backgroundColor: "121212" } : {}}>
                    <FontAwesomeIcon icon="paint-roller" size="lg" style={{ transition: "transform 0.1s", transform: this.brushMarks && this.brushMarks.size > 0 ? "rotate(45deg)" : "" }} />
                </button>
                <button className="dropdown-button antimodeMenu-button" onPointerDown={onDropdownClick}><FontAwesomeIcon icon="caret-down" size="sm" /></button>
                {this.showBrushDropdown ?
                    (<div className="dropdown">
                        <p>{label}</p>
                        <button onPointerDown={this.clearBrush}>Clear brush</button>
                        {/* <input placeholder="Enter URL"></input> */}
                    </div>)
                    : <></>}
            </div>
        );
    }

    @action
    clearBrush() {
        RichTextMenu.Instance.brushIsEmpty = true;
        RichTextMenu.Instance.brushMarks = new Set();
    }

    @action
    fillBrush(state: EditorState<any>, dispatch: any) {
        if (!this.view) return;

        if (this.brushIsEmpty) {
            const selected_marks = this.getMarksInSelection(this.view.state);
            if (selected_marks.size >= 0) {
                this.brushMarks = selected_marks;
                this.brushIsEmpty = !this.brushIsEmpty;
            }
            // }
        }
        else {
            const { from, to, $from } = this.view.state.selection;
            if (!this.view.state.selection.empty && $from && $from.nodeAfter) {
                if (this.brushMarks && to - from > 0) {
                    this.view.dispatch(this.view.state.tr.removeMark(from, to));
                    Array.from(this.brushMarks).filter(m => m.type !== schema.marks.user_mark).forEach((mark: Mark) => {
                        this.setMark(mark, this.view!.state, this.view!.dispatch);
                    });
                }
            }
            else {
                this.brushIsEmpty = !this.brushIsEmpty;
            }
        }
    }

    @action toggleColorDropdown() { this.showColorDropdown = !this.showColorDropdown; }
    @action setActiveColor(color: string) { this.activeFontColor = color; }

    createColorButton() {
        const self = this;
        function onColorClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && self.insertColor(self.activeFontColor, self.view.state, self.view.dispatch);
        }
        function onDropdownClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.toggleColorDropdown();
        }
        function changeColor(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.setActiveColor(color);
            self.view && self.insertColor(self.activeFontColor, self.view.state, self.view.dispatch);
        }

        const colors = [
            DarkPastelSchemaPalette.get("pink2"),
            DarkPastelSchemaPalette.get("purple4"),
            DarkPastelSchemaPalette.get("bluegreen1"),
            DarkPastelSchemaPalette.get("yellow4"),
            DarkPastelSchemaPalette.get("red2"),
            DarkPastelSchemaPalette.get("bluegreen7"),
            DarkPastelSchemaPalette.get("bluegreen5"),
            DarkPastelSchemaPalette.get("orange1"),
            "#757472",
            "#000"
        ];

        return (
            <div className="button-dropdown-wrapper">
                <button className="antimodeMenu-button color-preview-button" title="" onPointerDown={onColorClick}>
                    <FontAwesomeIcon icon="palette" size="lg" />
                    <div className="color-preview" style={{ backgroundColor: this.activeFontColor }}></div>
                </button>
                <button className="dropdown-button antimodeMenu-button" onPointerDown={onDropdownClick}><FontAwesomeIcon icon="caret-down" size="sm" /></button>
                {this.showColorDropdown ?
                    (<div className="dropdown">
                        <p>Change font color:</p>
                        <div className="color-wrapper">
                            {colors.map(color => {
                                if (color) {
                                    return this.activeFontColor === color ?
                                        <button className="color-button active" style={{ backgroundColor: color }} onPointerDown={e => changeColor(e, color)}></button> :
                                        <button className="color-button" style={{ backgroundColor: color }} onPointerDown={e => changeColor(e, color)}></button>;
                                }
                            })}
                        </div>
                    </div>)
                    : <></>}
            </div>
        );
    }

    public insertColor(color: String, state: EditorState<any>, dispatch: any) {
        const colorMark = state.schema.mark(state.schema.marks.pFontColor, { color: color });
        if (state.selection.empty) {
            dispatch(state.tr.addStoredMark(colorMark));
            return false;
        }
        this.setMark(colorMark, state, dispatch);
    }

    @action toggleHighlightDropdown() { this.showHighlightDropdown = !this.showHighlightDropdown; }
    @action setActiveHighlight(color: string) { this.activeHighlightColor = color; }

    createHighlighterButton() {
        const self = this;
        function onHighlightClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && self.insertHighlight(self.activeHighlightColor, self.view.state, self.view.dispatch);
        }
        function onDropdownClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.toggleHighlightDropdown();
        }
        function changeHighlight(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.setActiveHighlight(color);
            self.view && self.insertHighlight(self.activeHighlightColor, self.view.state, self.view.dispatch);
        }

        const colors = [
            PastelSchemaPalette.get("pink2"),
            PastelSchemaPalette.get("purple4"),
            PastelSchemaPalette.get("bluegreen1"),
            PastelSchemaPalette.get("yellow4"),
            PastelSchemaPalette.get("red2"),
            PastelSchemaPalette.get("bluegreen7"),
            PastelSchemaPalette.get("bluegreen5"),
            PastelSchemaPalette.get("orange1"),
            "white",
            "transparent"
        ];

        return (
            <div className="button-dropdown-wrapper">
                <button className="antimodeMenu-button color-preview-button" title="" onPointerDown={onHighlightClick}>
                    <FontAwesomeIcon icon="highlighter" size="lg" />
                    <div className="color-preview" style={{ backgroundColor: this.activeHighlightColor }}></div>
                </button>
                <button className="dropdown-button antimodeMenu-button" onPointerDown={onDropdownClick}><FontAwesomeIcon icon="caret-down" size="sm" /></button>
                {this.showHighlightDropdown ?
                    (<div className="dropdown">
                        <p>Change highlight color:</p>
                        <div className="color-wrapper">
                            {colors.map(color => {
                                if (color) {
                                    return this.activeHighlightColor === color ?
                                        <button className="color-button active" style={{ backgroundColor: color }} onPointerDown={e => changeHighlight(e, color)}>{color === "transparent" ? "X" : ""}</button> :
                                        <button className="color-button" style={{ backgroundColor: color }} onPointerDown={e => changeHighlight(e, color)}>{color === "transparent" ? "X" : ""}</button>;
                                }
                            })}
                        </div>
                    </div>)
                    : <></>}
            </div>
        );
    }

    insertHighlight(color: String, state: EditorState<any>, dispatch: any) {
        if (state.selection.empty) return false;
        toggleMark(state.schema.marks.marker, { highlight: color })(state, dispatch);
    }

    @action toggleLinkDropdown() { this.showLinkDropdown = !this.showLinkDropdown; }
    @action setCurrentLink(link: string) { this.currentLink = link; }

    createLinkButton() {
        const self = this;
        function onDropdownClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.toggleLinkDropdown();
        }
        function onLinkChange(e: React.ChangeEvent<HTMLInputElement>) {
            self.setCurrentLink(e.target.value);
        }

        const link = this.currentLink ? this.currentLink : "";

        return (
            <div className="button-dropdown-wrapper">
                <button className="antimodeMenu-button" title="" onPointerDown={onDropdownClick}><FontAwesomeIcon icon="link" size="lg" /></button>
                <button className="dropdown-button antimodeMenu-button" onPointerDown={onDropdownClick}><FontAwesomeIcon icon="caret-down" size="sm" /></button>
                {this.showLinkDropdown ?
                    (<div className="dropdown link-menu">
                        <p>Linked to:</p>
                        <input value={link} placeholder="Enter URL" onChange={onLinkChange} />
                        <button className="make-button" onPointerDown={e => this.makeLinkToURL(link, "onRight")}>Apply hyperlink</button>
                        <div className="divider"></div>
                        <button className="remove-button" onPointerDown={e => this.deleteLink()}>Remove link</button>
                    </div>)
                    : <></>}
            </div>
        );
    }

    async getTextLinkTargetTitle() {
        if (!this.view) return;

        const node = this.view.state.selection.$from.nodeAfter;
        const link = node && node.marks.find(m => m.type.name === "link");
        if (link) {
            const href = link.attrs.href;
            if (href) {
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    if (linkclicked) {
                        const linkDoc = await DocServer.GetRefField(linkclicked);
                        if (linkDoc instanceof Doc) {
                            const anchor1 = await Cast(linkDoc.anchor1, Doc);
                            const anchor2 = await Cast(linkDoc.anchor2, Doc);
                            const currentDoc = SelectionManager.SelectedDocuments().length && SelectionManager.SelectedDocuments()[0].props.Document;
                            if (currentDoc && anchor1 && anchor2) {
                                if (Doc.AreProtosEqual(currentDoc, anchor1)) {
                                    return StrCast(anchor2.title);
                                }
                                if (Doc.AreProtosEqual(currentDoc, anchor2)) {
                                    return StrCast(anchor1.title);
                                }
                            }
                        }
                    }
                } else {
                    return href;
                }
            } else {
                return link.attrs.title;
            }
        }
    }

    // TODO: should check for valid URL
    makeLinkToURL = (target: String, lcoation: string) => {
        if (!this.view) return;

        let node = this.view.state.selection.$from.nodeAfter;
        let link = this.view.state.schema.mark(this.view.state.schema.marks.link, { href: target, location: location });
        this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link));
        this.view.dispatch(this.view.state.tr.addMark(this.view.state.selection.from, this.view.state.selection.to, link));
        node = this.view.state.selection.$from.nodeAfter;
        link = node && node.marks.find(m => m.type.name === "link");
    }

    deleteLink = () => {
        if (!this.view) return;

        const node = this.view.state.selection.$from.nodeAfter;
        const link = node && node.marks.find(m => m.type === this.view!.state.schema.marks.link);
        const href = link!.attrs.href;
        if (href) {
            if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                const linkclicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                if (linkclicked) {
                    DocServer.GetRefField(linkclicked).then(async linkDoc => {
                        if (linkDoc instanceof Doc) {
                            LinkManager.Instance.deleteLink(linkDoc);
                            this.view!.dispatch(this.view!.state.tr.removeMark(this.view!.state.selection.from, this.view!.state.selection.to, this.view!.state.schema.marks.link));
                        }
                    });
                }
            } else {
                if (node) {
                    let extension = this.linkExtend(this.view!.state.selection.$anchor, href);
                    this.view!.dispatch(this.view!.state.tr.removeMark(extension.from, extension.to, this.view!.state.schema.marks.link));
                }
            }
        }
    }

    linkExtend($start: ResolvedPos, href: string) {
        const mark = this.view!.state.schema.marks.link;

        let startIndex = $start.index();
        let endIndex = $start.indexAfter();

        while (startIndex > 0 && $start.parent.child(startIndex - 1).marks.filter(m => m.type === mark && m.attrs.href === href).length) startIndex--;
        while (endIndex < $start.parent.childCount && $start.parent.child(endIndex).marks.filter(m => m.type === mark && m.attrs.href === href).length) endIndex++;

        let startPos = $start.start();
        let endPos = startPos;
        for (let i = 0; i < endIndex; i++) {
            let size = $start.parent.child(i).nodeSize;
            if (i < startIndex) startPos += size;
            endPos += size;
        }
        return { from: startPos, to: endPos };
    }

    reference_node(pos: ResolvedPos<any>): ProsNode | null {
        if (!this.view) return null;

        let ref_node: ProsNode = this.view.state.doc;
        if (pos.nodeBefore !== null && pos.nodeBefore !== undefined) {
            ref_node = pos.nodeBefore;
        }
        else if (pos.nodeAfter !== null && pos.nodeAfter !== undefined) {
            ref_node = pos.nodeAfter;
        }
        else if (pos.pos > 0) {
            let skip = false;
            for (let i: number = pos.pos - 1; i > 0; i--) {
                this.view.state.doc.nodesBetween(i, pos.pos, (node: ProsNode) => {
                    if (node.isLeaf && !skip) {
                        ref_node = node;
                        skip = true;
                    }

                });
            }
        }
        if (!ref_node.isLeaf && ref_node.childCount > 0) {
            ref_node = ref_node.child(0);
        }
        return ref_node;
    }

    @action onPointerEnter(e: React.PointerEvent) { RichTextMenu.Instance.overMenu = true; }
    @action onPointerLeave(e: React.PointerEvent) { RichTextMenu.Instance.overMenu = false; }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        this.Pinned = !this.Pinned;
        if (!this.Pinned) {
            this.fadeOut(true);
        }
    }

    render() {

        const fontSizeOptions = [
            { mark: schema.marks.pFontSize.create({ fontSize: 7 }), title: "Set font size", label: "7pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 8 }), title: "Set font size", label: "8pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 9 }), title: "Set font size", label: "8pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 10 }), title: "Set font size", label: "10pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 12 }), title: "Set font size", label: "12pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 14 }), title: "Set font size", label: "14pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 16 }), title: "Set font size", label: "16pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 18 }), title: "Set font size", label: "18pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 20 }), title: "Set font size", label: "20pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 24 }), title: "Set font size", label: "24pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 32 }), title: "Set font size", label: "32pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 48 }), title: "Set font size", label: "48pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 72 }), title: "Set font size", label: "72pt", command: this.changeFontSize },
            { mark: null, title: "", label: "various", command: unimplementedFunction, hidden: true },
            { mark: null, title: "", label: "13pt", command: unimplementedFunction, hidden: true }, // this is here because the default size is 13, but there is no actual 13pt option
        ];

        const fontFamilyOptions = [
            { mark: schema.marks.pFontFamily.create({ family: "Times New Roman" }), title: "Set font family", label: "Times New Roman", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Arial" }), title: "Set font family", label: "Arial", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Georgia" }), title: "Set font family", label: "Georgia", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Comic Sans MS" }), title: "Set font family", label: "Comic Sans MS", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Tahoma" }), title: "Set font family", label: "Tahoma", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Impact" }), title: "Set font family", label: "Impact", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Crimson Text" }), title: "Set font family", label: "Crimson Text", command: this.changeFontFamily },
            { mark: null, title: "", label: "various", command: unimplementedFunction, hidden: true },
            // { mark: null, title: "", label: "default", command: unimplementedFunction, hidden: true },
        ];

        const listTypeOptions = [
            { node: schema.nodes.ordered_list.create({ mapStyle: "bullet" }), title: "Set list type", label: ":", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "decimal" }), title: "Set list type", label: "1.1", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "multi" }), title: "Set list type", label: "1.A", command: this.changeListType },
            { node: undefined, title: "Set list type", label: "Remove", command: this.changeListType },
        ];

        const row1 = <div className="antimodeMenu-row">{[
            this.createButton("bold", "Bold", toggleMark(schema.marks.strong)),
            this.createButton("italic", "Italic", toggleMark(schema.marks.em)),
            this.createButton("underline", "Underline", toggleMark(schema.marks.underline)),
            this.createButton("strikethrough", "Strikethrough", toggleMark(schema.marks.strikethrough)),
            this.createButton("superscript", "Superscript", toggleMark(schema.marks.superscript)),
            this.createButton("subscript", "Subscript", toggleMark(schema.marks.subscript)),
            this.createColorButton(),
            this.createHighlighterButton(),
            this.createLinkButton(),
            this.createBrushButton(),
            this.createButton("indent", "Summarize", undefined, this.insertSummarizer),
        ]}</div>

        const row2 = <div className="antimodeMenu-row row-2">
            <div>{[
                this.createMarksDropdown(this.activeFontSize, fontSizeOptions),
                this.createMarksDropdown(this.activeFontFamily, fontFamilyOptions),
                this.createNodesDropdown(this.activeListType, listTypeOptions),
            ]}</div>
            <div>
                <button className="antimodeMenu-button" title="Pin menu" onClick={this.toggleMenuPin} style={this.Pinned ? { backgroundColor: "#121212" } : {}}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transition: "transform 0.1s", transform: this.Pinned ? "rotate(45deg)" : "" }} />
                </button>
                {this.getDragger()}
            </div>
        </div>

        const buttons = [
            row1, row2
        ];

        return (
            <div className="richTextMenu" onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                {this.getElementWithRows(buttons, 2, false)}
            </div>
        );
    }
}
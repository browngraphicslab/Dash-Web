import React = require("react");
import AntimodeMenu from "../../AntimodeMenu";
import { observable, action, } from "mobx";
import { observer } from "mobx-react";
import { Mark, MarkType, Node as ProsNode, NodeType, ResolvedPos, Schema } from "prosemirror-model";
import { schema } from "./schema_rts";
import { EditorView } from "prosemirror-view";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faBold, faItalic, faChevronLeft, faUnderline, faStrikethrough, faSubscript, faSuperscript, faIndent, faEyeDropper, faCaretDown, faPalette, faHighlighter, faLink, faPaintRoller, faSleigh } from "@fortawesome/free-solid-svg-icons";
import { updateBullets } from "./ProsemirrorExampleTransfer";
import { FieldViewProps } from "../FieldView";
import { Cast, StrCast } from "../../../../new_fields/Types";
import { FormattedTextBoxProps } from "./FormattedTextBox";
import { unimplementedFunction, Utils } from "../../../../Utils";
import { wrapInList } from "prosemirror-schema-list";
import { PastelSchemaPalette, DarkPastelSchemaPalette } from '../../../../new_fields/SchemaHeaderField';
import "./RichTextMenu.scss";
import { DocServer } from "../../../DocServer";
import { Doc } from "../../../../new_fields/Doc";
import { SelectionManager } from "../../../util/SelectionManager";
import { LinkManager } from "../../../util/LinkManager";
const { toggleMark, setBlockType } = require("prosemirror-commands");

library.add(faBold, faItalic, faChevronLeft, faUnderline, faStrikethrough, faSuperscript, faSubscript, faIndent, faEyeDropper, faCaretDown, faPalette, faHighlighter, faLink, faPaintRoller);

@observer
export default class RichTextMenu extends AntimodeMenu {
    static Instance: RichTextMenu;
    public overMenu: boolean = false; // kind of hacky way to prevent selects not being selectable

    private view?: EditorView;
    public editorProps: FieldViewProps & FormattedTextBoxProps | undefined;

    public _brushMap: Map<string, Set<Mark>> = new Map();
    private fontSizeOptions: { mark: Mark | null, title: string, label: string, command: any, hidden?: boolean, style?: {} }[];
    private fontFamilyOptions: { mark: Mark | null, title: string, label: string, command: any, hidden?: boolean, style?: {} }[];
    private listTypeOptions: { node: NodeType | any | null, title: string, label: string, command: any, style?: {} }[];
    private fontColors: (string | undefined)[];
    private highlightColors: (string | undefined)[];

    @observable private collapsed: boolean = false;
    @observable private boldActive: boolean = false;
    @observable private italicsActive: boolean = false;
    @observable private underlineActive: boolean = false;
    @observable private strikethroughActive: boolean = false;
    @observable private subscriptActive: boolean = false;
    @observable private superscriptActive: boolean = false;

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

        this.fontSizeOptions = [
            { mark: schema.marks.pFontSize.create({ fontSize: 7 }), title: "Set font size", label: "7pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 8 }), title: "Set font size", label: "8pt", command: this.changeFontSize },
            { mark: schema.marks.pFontSize.create({ fontSize: 9 }), title: "Set font size", label: "9pt", command: this.changeFontSize },
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

        this.fontFamilyOptions = [
            { mark: schema.marks.pFontFamily.create({ family: "Times New Roman" }), title: "Set font family", label: "Times New Roman", command: this.changeFontFamily, style: { fontFamily: "Times New Roman" } },
            { mark: schema.marks.pFontFamily.create({ family: "Arial" }), title: "Set font family", label: "Arial", command: this.changeFontFamily, style: { fontFamily: "Arial" } },
            { mark: schema.marks.pFontFamily.create({ family: "Georgia" }), title: "Set font family", label: "Georgia", command: this.changeFontFamily, style: { fontFamily: "Georgia" } },
            { mark: schema.marks.pFontFamily.create({ family: "Comic Sans MS" }), title: "Set font family", label: "Comic Sans MS", command: this.changeFontFamily, style: { fontFamily: "Comic Sans MS" } },
            { mark: schema.marks.pFontFamily.create({ family: "Tahoma" }), title: "Set font family", label: "Tahoma", command: this.changeFontFamily, style: { fontFamily: "Tahoma" } },
            { mark: schema.marks.pFontFamily.create({ family: "Impact" }), title: "Set font family", label: "Impact", command: this.changeFontFamily, style: { fontFamily: "Impact" } },
            { mark: schema.marks.pFontFamily.create({ family: "Crimson Text" }), title: "Set font family", label: "Crimson Text", command: this.changeFontFamily, style: { fontFamily: "Crimson Text" } },
            { mark: null, title: "", label: "various", command: unimplementedFunction, hidden: true },
            // { mark: null, title: "", label: "default", command: unimplementedFunction, hidden: true },
        ];

        this.listTypeOptions = [
            { node: schema.nodes.ordered_list.create({ mapStyle: "bullet" }), title: "Set list type", label: ":", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "decimal" }), title: "Set list type", label: "1.1", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "multi" }), title: "Set list type", label: "1.A", command: this.changeListType },
            { node: undefined, title: "Set list type", label: "Remove", command: this.changeListType },
        ];

        this.fontColors = [
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

        this.highlightColors = [
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
    }

    @action
    changeView(view: EditorView) {
        this.view = view;
    }

    update(view: EditorView, lastState: EditorState | undefined) {
        this.updateFromDash(view, lastState, this.editorProps);
    }


    public MakeLinkToSelection = (linkDocId: string, title: string, location: string, targetDocId: string): string => {
        if (this.view) {
            const link = this.view.state.schema.marks.link.create({ href: Utils.prepend("/doc/" + linkDocId), title: title, location: location, linkId: linkDocId, targetId: targetDocId });
            this.view.dispatch(this.view.state.tr.removeMark(this.view.state.selection.from, this.view.state.selection.to, this.view.state.schema.marks.link).
                addMark(this.view.state.selection.from, this.view.state.selection.to, link));
            return this.view.state.selection.$from.nodeAfter?.text || "";
        }
        return "";
    }

    @action
    public async updateFromDash(view: EditorView, lastState: EditorState | undefined, props: any) {
        if (!view) {
            console.log("no editor?  why?");
            return;
        }
        this.view = view;
        const state = view.state;
        props && (this.editorProps = props);

        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) && lastState.selection.eq(state.selection)) return;

        // update active marks
        const activeMarks = this.getActiveMarksOnSelection();
        this.setActiveMarkButtons(activeMarks);

        // update active font family and size
        const active = this.getActiveFontStylesOnSelection();
        const activeFamilies = active && active.get("families");
        const activeSizes = active && active.get("sizes");

        this.activeFontFamily = !activeFamilies || activeFamilies.length === 0 ? "Arial" : activeFamilies.length === 1 ? String(activeFamilies[0]) : "various";
        this.activeFontSize = !activeSizes || activeSizes.length === 0 ? "13pt" : activeSizes.length === 1 ? String(activeSizes[0]) + "pt" : "various";

        // update link in current selection
        const targetTitle = await this.getTextLinkTargetTitle();
        this.setCurrentLink(targetTitle);
    }

    setMark = (mark: Mark, state: EditorState<any>, dispatch: any) => {
        if (mark) {
            const node = (state.selection as NodeSelection).node;
            if (node?.type === schema.nodes.ordered_list) {
                let attrs = node.attrs;
                if (mark.type === schema.marks.pFontFamily) attrs = { ...attrs, setFontFamily: mark.attrs.family };
                if (mark.type === schema.marks.pFontSize) attrs = { ...attrs, setFontSize: mark.attrs.fontSize };
                if (mark.type === schema.marks.pFontColor) attrs = { ...attrs, setFontColor: mark.attrs.color };
                const tr = updateBullets(state.tr.setNodeMarkup(state.selection.from, node.type, attrs), state.schema);
                dispatch(tr.setSelection(new NodeSelection(tr.doc.resolve(state.selection.from))));
            } else {
                toggleMark(mark.type, mark.attrs)(state, (tx: any) => {
                    const { from, $from, to, empty } = tx.selection;
                    // if (!tx.doc.rangeHasMark(from, to, mark.type)) {
                    //     toggleMark(mark.type, mark.attrs)({ tr: tx, doc: tx.doc, selection: tx.selection, storedMarks: tx.storedMarks }, dispatch);
                    // } else
                    dispatch(tx);
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

        const styles = new Map<String, String[]>();
        styles.set("families", activeFamilies);
        styles.set("sizes", activeSizes);
        return styles;
    }

    getMarksInSelection(state: EditorState<any>) {
        const found = new Set<Mark>();
        const { from, to } = state.selection as TextSelection;
        state.doc.nodesBetween(from, to, (node) => node.marks.forEach(m => found.add(m)));
        return found;
    }

    //finds all active marks on selection in given group
    getActiveMarksOnSelection() {
        if (!this.view) return;

        const markGroup = [schema.marks.strong, schema.marks.em, schema.marks.underline, schema.marks.strikethrough, schema.marks.superscript, schema.marks.subscript];
        if (this.view.state.storedMarks) return this.view.state.storedMarks.map(mark => mark.type);
        //current selection
        const { empty, ranges, $to } = this.view.state.selection as TextSelection;
        const state = this.view.state;
        let activeMarks: MarkType[] = [];
        if (!empty) {
            activeMarks = markGroup.filter(mark => {
                const has = false;
                for (let i = 0; !has && i < ranges.length; i++) {
                    return state.doc.rangeHasMark(ranges[i].$from.pos, ranges[i].$to.pos, mark);
                }
                return false;
            });
        }
        else {
            const pos = this.view.state.selection.$from;
            const ref_node: ProsNode | null = this.reference_node(pos);
            if (ref_node !== null && ref_node !== this.view.state.doc) {
                if (ref_node.isText) {
                }
                else {
                    return [];
                }
                activeMarks = markGroup.filter(mark_type => {
                    if (mark_type === state.schema.marks.pFontSize) {
                        return ref_node.marks.some(m => m.type.name === state.schema.marks.pFontSize.name);
                    }
                    const mark = state.schema.mark(mark_type);
                    return ref_node.marks.includes(mark);
                });
            }
        }
        return activeMarks;
    }

    destroy() {
        this.fadeOut(true);
    }

    @action
    setActiveMarkButtons(activeMarks: MarkType[] | undefined) {
        if (!activeMarks) return;

        this.boldActive = false;
        this.italicsActive = false;
        this.underlineActive = false;
        this.strikethroughActive = false;
        this.subscriptActive = false;
        this.superscriptActive = false;

        activeMarks.forEach(mark => {
            switch (mark.name) {
                case "strong": this.boldActive = true; break;
                case "em": this.italicsActive = true; break;
                case "underline": this.underlineActive = true; break;
                case "strikethrough": this.strikethroughActive = true; break;
                case "subscript": this.subscriptActive = true; break;
                case "superscript": this.superscriptActive = true; break;
            }
        });
    }

    createButton(faIcon: string, title: string, isActive: boolean = false, command?: any, onclick?: any) {
        const self = this;
        function onClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && command && command(self.view.state, self.view.dispatch, self.view);
            self.view && onclick && onclick(self.view.state, self.view.dispatch, self.view);
            self.setActiveMarkButtons(self.getActiveMarksOnSelection());
        }

        return (
            <button className={"antimodeMenu-button" + (isActive ? " active" : "")} key={title} title={title} onPointerDown={onClick}>
                <FontAwesomeIcon icon={faIcon as IconProp} size="lg" />
            </button>
        );
    }

    createMarksDropdown(activeOption: string, options: { mark: Mark | null, title: string, label: string, command: (mark: Mark, view: EditorView) => void, hidden?: boolean, style?: {} }[], key: string): JSX.Element {
        const items = options.map(({ title, label, hidden, style }) => {
            if (hidden) {
                return label === activeOption ?
                    <option value={label} title={title} key={label} style={style ? style : {}} selected hidden>{label}</option> :
                    <option value={label} title={title} key={label} style={style ? style : {}} hidden>{label}</option>;
            }
            return label === activeOption ?
                <option value={label} title={title} key={label} style={style ? style : {}} selected>{label}</option> :
                <option value={label} title={title} key={label} style={style ? style : {}}>{label}</option>;
        });

        const self = this;
        function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
            e.stopPropagation();
            e.preventDefault();
            options.forEach(({ label, mark, command }) => {
                if (e.target.value === label) {
                    self.view && mark && command(mark, self.view);
                }
            });
        }
        return <select onChange={onChange} key={key}>{items}</select>;
    }

    createNodesDropdown(activeOption: string, options: { node: NodeType | any | null, title: string, label: string, command: (node: NodeType | any) => void, hidden?: boolean, style?: {} }[], key: string): JSX.Element {
        const items = options.map(({ title, label, hidden, style }) => {
            if (hidden) {
                return label === activeOption ?
                    <option value={label} title={title} key={label} style={style ? style : {}} selected hidden>{label}</option> :
                    <option value={label} title={title} key={label} style={style ? style : {}} hidden>{label}</option>;
            }
            return label === activeOption ?
                <option value={label} title={title} key={label} style={style ? style : {}} selected>{label}</option> :
                <option value={label} title={title} key={label} style={style ? style : {}}>{label}</option>;
        });

        const self = this;
        function onChange(val: string) {
            options.forEach(({ label, node, command }) => {
                if (val === label) {
                    self.view && node && command(node);
                }
            });
        }
        return <select onChange={e => onChange(e.target.value)} key={key}>{items}</select>;
    }

    changeFontSize = (mark: Mark, view: EditorView) => {
        this.setMark(view.state.schema.marks.pFontSize.create({ fontSize: mark.attrs.fontSize }), view.state, view.dispatch);
    }

    changeFontFamily = (mark: Mark, view: EditorView) => {
        this.setMark(view.state.schema.marks.pFontFamily.create({ family: mark.attrs.family }), view.state, view.dispatch);
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

    // todo: add brushes to brushMap to save with a style name
    onBrushNameKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            RichTextMenu.Instance.brushMarks && RichTextMenu.Instance._brushMap.set(this._brushNameRef.current!.value, RichTextMenu.Instance.brushMarks);
            this._brushNameRef.current!.style.background = "lightGray";
        }
    }
    _brushNameRef = React.createRef<HTMLInputElement>();

    createBrushButton() {
        const self = this;
        function onBrushClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.view && self.fillBrush(self.view.state, self.view.dispatch);
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

        const button =
            <button className="antimodeMenu-button" title="" onPointerDown={onBrushClick} style={this.brushMarks?.size > 0 ? { backgroundColor: "121212" } : {}}>
                <FontAwesomeIcon icon="paint-roller" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.brushMarks?.size > 0 ? 45 : 0}deg)` }} />
            </button>;

        const dropdownContent =
            <div className="dropdown">
                <p>{label}</p>
                <button onPointerDown={this.clearBrush}>Clear brush</button>
                <input placeholder="-brush name-" ref={this._brushNameRef} onKeyPress={this.onBrushNameKeyPress}></input>
            </div>;

        return (
            <ButtonDropdown view={this.view} key={"brush dropdown"} button={button} dropdownContent={dropdownContent} />
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
        function changeColor(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.setActiveColor(color);
            self.view && self.insertColor(self.activeFontColor, self.view.state, self.view.dispatch);
        }

        const button =
            <button className="antimodeMenu-button color-preview-button" title="" onPointerDown={onColorClick}>
                <FontAwesomeIcon icon="palette" size="lg" />
                <div className="color-preview" style={{ backgroundColor: this.activeFontColor }}></div>
            </button>;

        const dropdownContent =
            <div className="dropdown" >
                <p>Change font color:</p>
                <div className="color-wrapper">
                    {this.fontColors.map(color => {
                        if (color) {
                            return this.activeFontColor === color ?
                                <button className="color-button active" key={"active" + color} style={{ backgroundColor: color }} onPointerDown={e => changeColor(e, color)}></button> :
                                <button className="color-button" key={"other" + color} style={{ backgroundColor: color }} onPointerDown={e => changeColor(e, color)}></button>;
                        }
                    })}
                </div>
            </div>;

        return (
            <ButtonDropdown view={this.view} key={"color dropdown"} button={button} dropdownContent={dropdownContent} />
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
        function changeHighlight(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.view && self.view.focus();
            self.setActiveHighlight(color);
            self.view && self.insertHighlight(self.activeHighlightColor, self.view.state, self.view.dispatch);
        }

        const button =
            <button className="antimodeMenu-button color-preview-button" title="" key="highilghter-button" onPointerDown={onHighlightClick}>
                <FontAwesomeIcon icon="highlighter" size="lg" />
                <div className="color-preview" style={{ backgroundColor: this.activeHighlightColor }}></div>
            </button>;

        const dropdownContent =
            <div className="dropdown">
                <p>Change highlight color:</p>
                <div className="color-wrapper">
                    {this.highlightColors.map(color => {
                        if (color) {
                            return this.activeHighlightColor === color ?
                                <button className="color-button active" key={`active ${color}`} style={{ backgroundColor: color }} onPointerDown={e => changeHighlight(e, color)}>{color === "transparent" ? "X" : ""}</button> :
                                <button className="color-button" key={`inactive ${color}`} style={{ backgroundColor: color }} onPointerDown={e => changeHighlight(e, color)}>{color === "transparent" ? "X" : ""}</button>;
                        }
                    })}
                </div>
            </div>;

        return (
            <ButtonDropdown view={this.view} key={"highlighter"} button={button} dropdownContent={dropdownContent} />
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

        function onLinkChange(e: React.ChangeEvent<HTMLInputElement>) {
            self.setCurrentLink(e.target.value);
        }

        const link = this.currentLink ? this.currentLink : "";

        const button = <FontAwesomeIcon icon="link" size="lg" />;

        const dropdownContent =
            <div className="dropdown link-menu">
                <p>Linked to:</p>
                <input value={link} placeholder="Enter URL" onChange={onLinkChange} />
                <button className="make-button" onPointerDown={e => this.makeLinkToURL(link, "onRight")}>Apply hyperlink</button>
                <div className="divider"></div>
                <button className="remove-button" onPointerDown={e => this.deleteLink()}>Remove link</button>
            </div>;

        return (
            <ButtonDropdown view={this.view} key={"link button"} button={button} dropdownContent={dropdownContent} openDropdownOnButton={true} />
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
                    const { tr, schema, selection } = this.view.state;
                    const extension = this.linkExtend(selection.$anchor, href);
                    this.view.dispatch(tr.removeMark(extension.from, extension.to, schema.marks.link));
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
            const size = $start.parent.child(i).nodeSize;
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

    @action
    protected toggleCollapse = (e: React.MouseEvent) => {
        this.collapsed = !this.collapsed;
        setTimeout(() => {
            const x = Math.min(this._left, window.innerWidth - RichTextMenu.Instance.width);
            RichTextMenu.Instance.jumpTo(x, this._top);
        }, 0);
    }

    render() {

        const row1 = <div className="antimodeMenu-row" key="row1" style={{ display: this.collapsed ? "none" : undefined }}>{[
            this.createButton("bold", "Bold", this.boldActive, toggleMark(schema.marks.strong)),
            this.createButton("italic", "Italic", this.italicsActive, toggleMark(schema.marks.em)),
            this.createButton("underline", "Underline", this.underlineActive, toggleMark(schema.marks.underline)),
            this.createButton("strikethrough", "Strikethrough", this.strikethroughActive, toggleMark(schema.marks.strikethrough)),
            this.createButton("superscript", "Superscript", this.superscriptActive, toggleMark(schema.marks.superscript)),
            this.createButton("subscript", "Subscript", this.subscriptActive, toggleMark(schema.marks.subscript)),
            this.createColorButton(),
            this.createHighlighterButton(),
            this.createLinkButton(),
            this.createBrushButton(),
            this.createButton("indent", "Summarize", undefined, this.insertSummarizer),
        ]}</div>;

        const row2 = <div className="antimodeMenu-row row-2" key="antimodemenu row2">
            <div key="row" style={{ display: this.collapsed ? "none" : undefined }}>
                {[this.createMarksDropdown(this.activeFontSize, this.fontSizeOptions, "font size"),
                this.createMarksDropdown(this.activeFontFamily, this.fontFamilyOptions, "font family"),
                this.createNodesDropdown(this.activeListType, this.listTypeOptions, "nodes")]}
            </div>
            <div key="button">
                <div key="collapser">
                    <button className="antimodeMenu-button" key="collapse menu" title="Collapse menu" onClick={this.toggleCollapse} style={{ backgroundColor: this.collapsed ? "#121212" : "", width: 25 }}>
                        <FontAwesomeIcon icon="chevron-left" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.3s", transform: `rotate(${this.collapsed ? 180 : 0}deg)` }} />
                    </button>
                </div>
                <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: this.Pinned ? "#121212" : "", display: this.collapsed ? "none" : undefined }}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
                </button>
                {this.getDragger()}
            </div>
        </div>;

        return (
            <div className="richTextMenu" onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave}>
                {this.getElementWithRows([row1, row2], 2, false)}
            </div>
        );
    }
}

interface ButtonDropdownProps {
    view?: EditorView;
    button: JSX.Element;
    dropdownContent: JSX.Element;
    openDropdownOnButton?: boolean;
}

@observer
class ButtonDropdown extends React.Component<ButtonDropdownProps> {

    @observable private showDropdown: boolean = false;
    private ref: HTMLDivElement | null = null;

    componentDidMount() {
        document.addEventListener("pointerdown", this.onBlur);
    }

    componentWillUnmount() {
        document.removeEventListener("pointerdown", this.onBlur);
    }

    @action
    setShowDropdown(show: boolean) {
        this.showDropdown = show;
    }
    @action
    toggleDropdown() {
        this.showDropdown = !this.showDropdown;
    }

    onDropdownClick = (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.props.view && this.props.view.focus();
        this.toggleDropdown();
    }

    onBlur = (e: PointerEvent) => {
        setTimeout(() => {
            if (this.ref !== null && !this.ref.contains(e.target as Node)) {
                this.setShowDropdown(false);
            }
        }, 0);
    }

    render() {
        return (
            <div className="button-dropdown-wrapper" ref={node => this.ref = node}>
                {this.props.openDropdownOnButton ?
                    <button className="antimodeMenu-button dropdown-button-combined" onPointerDown={this.onDropdownClick}>
                        {this.props.button}
                        <FontAwesomeIcon icon="caret-down" size="sm" />
                    </button> :
                    <>
                        {this.props.button}
                        <button className="dropdown-button antimodeMenu-button" key="antimodebutton" onPointerDown={this.onDropdownClick}>
                            <FontAwesomeIcon icon="caret-down" size="sm" />
                        </button>
                    </>}

                {this.showDropdown ? this.props.dropdownContent : (null)}
            </div>
        );
    }
}
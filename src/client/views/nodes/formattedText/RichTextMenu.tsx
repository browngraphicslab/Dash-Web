import React = require("react");
import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faBold, faCaretDown, faChevronLeft, faEyeDropper, faHighlighter, faOutdent, faIndent, faHandPointLeft, faHandPointRight, faItalic, faLink, faPaintRoller, faPalette, faStrikethrough, faSubscript, faSuperscript, faUnderline } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, observable, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { lift, wrapIn } from "prosemirror-commands";
import { Mark, MarkType, Node as ProsNode, NodeType, ResolvedPos } from "prosemirror-model";
import { wrapInList } from "prosemirror-schema-list";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../../../fields/Doc";
import { DarkPastelSchemaPalette, PastelSchemaPalette } from '../../../../fields/SchemaHeaderField';
import { Cast, StrCast, BoolCast, NumCast } from "../../../../fields/Types";
import { unimplementedFunction, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { LinkManager } from "../../../util/LinkManager";
import { SelectionManager } from "../../../util/SelectionManager";
import AntimodeMenu from "../../AntimodeMenu";
import { FieldViewProps } from "../FieldView";
import { FormattedTextBox, FormattedTextBoxProps } from "./FormattedTextBox";
import { updateBullets } from "./ProsemirrorExampleTransfer";
import "./RichTextMenu.scss";
import { schema } from "./schema_rts";
import { TraceMobx } from "../../../../fields/util";
import { UndoManager, undoBatch } from "../../../util/UndoManager";
import { Tooltip } from "@material-ui/core";
const { toggleMark } = require("prosemirror-commands");

library.add(faBold, faItalic, faChevronLeft, faUnderline, faStrikethrough, faSuperscript, faSubscript, faOutdent, faIndent, faHandPointLeft, faHandPointRight, faEyeDropper, faCaretDown, faPalette, faHighlighter, faLink, faPaintRoller);


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
    @observable private activeAlignment: string = "left";

    @observable private brushIsEmpty: boolean = true;
    @observable private brushMarks: Set<Mark> = new Set();
    @observable private showBrushDropdown: boolean = false;

    @observable private activeFontColor: string = "black";
    @observable private showColorDropdown: boolean = false;

    @observable private activeHighlightColor: string = "transparent";
    @observable private showHighlightDropdown: boolean = false;

    @observable private currentLink: string | undefined = "";
    @observable private showLinkDropdown: boolean = false;

    _reaction: IReactionDisposer | undefined;
    _delayHide = false;
    constructor(props: Readonly<{}>) {
        super(props);
        RichTextMenu.Instance = this;
        this._canFade = false;
        this.Pinned = BoolCast(Doc.UserDoc()["menuRichText-pinned"]);

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
            { mark: null, title: "", label: "...", command: unimplementedFunction, hidden: true },
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
            { node: schema.nodes.ordered_list.create({ mapStyle: "multi" }), title: "Set list type", label: "A.1", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "" }), title: "Set list type", label: "<none>", command: this.changeListType },
            //{ node: undefined, title: "Set list type", label: "Remove", command: this.changeListType },
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

    componentDidMount() {
        this._reaction = reaction(() => SelectionManager.SelectedDocuments(),
            () => this._delayHide && !(this._delayHide = false) && this.fadeOut(true));
    }
    componentWillUnmount() {
        this._reaction?.();
    }

    public delayHide = () => this._delayHide = true;

    @action
    changeView(view: EditorView) {
        if ((view as any)?.TextView?.props.isSelected(true)) {
            this.view = view;
        }
    }

    update(view: EditorView, lastState: EditorState | undefined) {
        this.updateFromDash(view, lastState, this.editorProps);
    }

    @action
    public async updateFromDash(view: EditorView, lastState: EditorState | undefined, props: any) {
        if (!view || !(view as any).TextView?.props.isSelected(true)) {
            return;
        }
        this.view = view;
        props && (this.editorProps = props);

        // Don't do anything if the document/selection didn't change
        if (lastState?.doc.eq(view.state.doc) && lastState.selection.eq(view.state.selection)) return;

        // update active marks
        const activeMarks = this.getActiveMarksOnSelection();
        this.setActiveMarkButtons(activeMarks);

        // update active font family and size
        const active = this.getActiveFontStylesOnSelection();
        const activeFamilies = active.activeFamilies;
        const activeSizes = active.activeSizes;
        const activeColors = active.activeColors;
        const activeHighlights = active.activeHighlights;

        this.activeListType = this.getActiveListStyle();
        this.activeAlignment = this.getActiveAlignment();
        this.activeFontFamily = !activeFamilies.length ? "Arial" : activeFamilies.length === 1 ? String(activeFamilies[0]) : "various";
        this.activeFontSize = !activeSizes.length ? "13pt" : activeSizes.length === 1 ? String(activeSizes[0]) : "...";
        this.activeFontColor = !activeColors.length ? "black" : activeColors.length === 1 ? String(activeColors[0]) : "...";
        this.activeHighlightColor = !activeHighlights.length ? "" : activeHighlights.length === 1 ? String(activeHighlights[0]) : "...";

        // update link in current selection
        const targetTitle = await this.getTextLinkTargetTitle();
        this.setCurrentLink(targetTitle);
    }

    setMark = (mark: Mark, state: EditorState<any>, dispatch: any, dontToggle: boolean = false) => {
        if (mark) {
            const node = (state.selection as NodeSelection).node;
            if (node?.type === schema.nodes.ordered_list) {
                let attrs = node.attrs;
                if (mark.type === schema.marks.pFontFamily) attrs = { ...attrs, fontFamily: mark.attrs.family };
                if (mark.type === schema.marks.pFontSize) attrs = { ...attrs, fontSize: `${mark.attrs.fontSize}px` };
                if (mark.type === schema.marks.pFontColor) attrs = { ...attrs, fontColor: mark.attrs.color };
                const tr = updateBullets(state.tr.setNodeMarkup(state.selection.from, node.type, attrs), state.schema);
                dispatch(tr.setSelection(new NodeSelection(tr.doc.resolve(state.selection.from))));
            } else if (dontToggle) {
                toggleMark(mark.type, mark.attrs)(state, (tx: any) => {
                    const { from, $from, to, empty } = tx.selection;
                    if (!tx.doc.rangeHasMark(from, to, mark.type)) { // hack -- should have just set the mark in the first place
                        toggleMark(mark.type, mark.attrs)({ tr: tx, doc: tx.doc, selection: tx.selection, storedMarks: tx.storedMarks }, dispatch);
                    } else dispatch(tx);
                });
            } else {
                toggleMark(mark.type, mark.attrs)(state, dispatch);
            }
        }
    }

    // finds font sizes and families in selection
    getActiveAlignment() {
        if (this.view && this.TextView.props.isSelected(true)) {
            const path = (this.view.state.selection.$from as any).path;
            for (let i = path.length - 3; i < path.length && i >= 0; i -= 3) {
                if (path[i]?.type === this.view.state.schema.nodes.paragraph || path[i]?.type === this.view.state.schema.nodes.heading) {
                    return path[i].attrs.align || "left";
                }
            }
        }
        return "left";
    }

    // finds font sizes and families in selection
    getActiveListStyle() {
        if (this.view && this.TextView.props.isSelected(true)) {
            const path = (this.view.state.selection.$from as any).path;
            for (let i = 0; i < path.length; i += 3) {
                if (path[i].type === this.view.state.schema.nodes.ordered_list) {
                    return path[i].attrs.mapStyle;
                }
            }
            if (this.view.state.selection.$from.nodeAfter?.type === this.view.state.schema.nodes.ordered_list) {
                return this.view.state.selection.$from.nodeAfter?.attrs.mapStyle;
            }
        }
        return "";
    }

    // finds font sizes and families in selection
    getActiveFontStylesOnSelection() {
        if (!this.view) return { activeFamilies: [], activeSizes: [], activeColors: [], activeHighlights: [] };

        const activeFamilies: string[] = [];
        const activeSizes: string[] = [];
        const activeColors: string[] = [];
        const activeHighlights: string[] = [];
        if (this.TextView.props.isSelected(true)) {
            const state = this.view.state;
            const pos = this.view.state.selection.$from;
            const ref_node = this.reference_node(pos);
            if (ref_node && ref_node !== this.view.state.doc && ref_node.isText) {
                ref_node.marks.forEach(m => {
                    m.type === state.schema.marks.pFontFamily && activeFamilies.push(m.attrs.family);
                    m.type === state.schema.marks.pFontColor && activeColors.push(m.attrs.color);
                    m.type === state.schema.marks.pFontSize && activeSizes.push(String(m.attrs.fontSize) + "pt");
                    m.type === state.schema.marks.marker && activeHighlights.push(String(m.attrs.highlight));
                });
            }
            !activeFamilies.length && (activeFamilies.push(StrCast(this.TextView.layoutDoc._fontFamily, StrCast(Doc.UserDoc().fontFamily))));
            !activeSizes.length && (activeSizes.push(StrCast(this.TextView.layoutDoc._fontSize, StrCast(Doc.UserDoc().fontSize))));
            !activeColors.length && (activeSizes.push(StrCast(this.TextView.layoutDoc.color, StrCast(Doc.UserDoc().fontColor))));
        }
        !activeFamilies.length && (activeFamilies.push(StrCast(Doc.UserDoc().fontFamily)));
        !activeSizes.length && (activeSizes.push(StrCast(Doc.UserDoc().fontSize)));
        !activeColors.length && (activeColors.push(StrCast(Doc.UserDoc().fontColor, "black")));
        !activeHighlights.length && (activeHighlights.push(StrCast(Doc.UserDoc().fontHighlight, "")));
        return { activeFamilies, activeSizes, activeColors, activeHighlights };
    }

    getMarksInSelection(state: EditorState<any>) {
        const found = new Set<Mark>();
        const { from, to } = state.selection as TextSelection;
        state.doc.nodesBetween(from, to, (node) => node.marks.forEach(m => found.add(m)));
        return found;
    }

    //finds all active marks on selection in given group
    getActiveMarksOnSelection() {
        let activeMarks: MarkType[] = [];
        if (!this.view || !this.TextView.props.isSelected(true)) return activeMarks;

        const markGroup = [schema.marks.strong, schema.marks.em, schema.marks.underline, schema.marks.strikethrough, schema.marks.superscript, schema.marks.subscript];
        if (this.view.state.storedMarks) return this.view.state.storedMarks.map(mark => mark.type);
        //current selection
        const { empty, ranges, $to } = this.view.state.selection as TextSelection;
        const state = this.view.state;
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
        !this.TextView?.props.isSelected(true) && this.fadeOut(true);
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
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => {
                self.view && command && command(self.view.state, self.view.dispatch, self.view);
                self.view && onclick && onclick(self.view.state, self.view.dispatch, self.view);
            }, "rich text menu command");
            self.setActiveMarkButtons(self.getActiveMarksOnSelection());
        }

        return (
            <Tooltip title={<div className="dash-tooltip">{title}</div>} key={title} placement="bottom">
                <button className={"antimodeMenu-button" + (isActive ? " active" : "")} onPointerDown={onClick}>
                    <FontAwesomeIcon icon={faIcon as IconProp} size="lg" />
                </button>
            </Tooltip>
        );
    }

    createMarksDropdown(activeOption: string, options: { mark: Mark | null, title: string, label: string, command: (mark: Mark, view: EditorView) => void, hidden?: boolean, style?: {} }[], key: string, setter: (val: string) => {}): JSX.Element {
        const items = options.map(({ title, label, hidden, style }) => {
            if (hidden) {
                return <option value={label} title={title} key={label} style={style ? style : {}} hidden>{label}</option>;
            }
            return <option value={label} title={title} key={label} style={style ? style : {}}>{label}</option>;
        });

        const self = this;
        function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
            e.stopPropagation();
            e.preventDefault();
            self.TextView.endUndoTypingBatch();
            options.forEach(({ label, mark, command }) => {
                if (e.target.value === label && mark) {
                    if (!self.TextView.props.isSelected(true)) {
                        switch (mark.type) {
                            case schema.marks.pFontFamily: setter(Doc.UserDoc().fontFamily = mark.attrs.family); break;
                            case schema.marks.pFontSize: setter(Doc.UserDoc().fontSize = mark.attrs.fontSize.toString() + "pt"); break;
                        }
                    }
                    else UndoManager.RunInBatch(() => self.view && mark && command(mark, self.view), "text mark dropdown");
                }
            });
        }
        return <Tooltip key={key} title={<div className="dash-tooltip">{key}</div>} placement="bottom">
            <select onChange={onChange} value={activeOption}>{items}</select>
        </Tooltip>;
    }

    createNodesDropdown(activeMap: string, options: { node: NodeType | any | null, title: string, label: string, command: (node: NodeType | any) => void, hidden?: boolean, style?: {} }[], key: string, setter: (val: string) => {}): JSX.Element {
        const activeOption = activeMap === "bullet" ? ":" : activeMap === "decimal" ? "1.1" : activeMap === "multi" ? "A.1" : "<none>";
        const items = options.map(({ title, label, hidden, style }) => {
            if (hidden) {
                return <option value={label} title={title} key={label} style={style ? style : {}} hidden>{label}</option>;
            }
            return <option value={label} title={title} key={label} style={style ? style : {}}>{label}</option>;
        });

        const self = this;
        function onChange(val: string) {
            self.TextView.endUndoTypingBatch();
            options.forEach(({ label, node, command }) => {
                if (val === label && node) {
                    if (self.TextView.props.isSelected(true)) {
                        UndoManager.RunInBatch(() => self.view && node && command(node), "nodes dropdown");
                        setter(val);
                    }
                }
            });
        }

        return <Tooltip key={key} title={<div className="dash-tooltip">{key}</div>} placement="bottom">
            <select value={activeOption} onChange={e => onChange(e.target.value)}>{items}</select>
        </Tooltip>;
    }

    changeFontSize = (mark: Mark, view: EditorView) => {
        this.setMark(view.state.schema.marks.pFontSize.create({ fontSize: mark.attrs.fontSize }), view.state, view.dispatch, true);
    }

    changeFontFamily = (mark: Mark, view: EditorView) => {
        this.setMark(view.state.schema.marks.pFontFamily.create({ family: mark.attrs.family }), view.state, view.dispatch, true);
    }

    // TODO: remove doesn't work
    //remove all node type and apply the passed-in one to the selected text
    changeListType = (nodeType: Node | undefined) => {
        if (!this.view || (nodeType as any)?.attrs.mapStyle === "") return;

        const nextIsOL = this.view.state.selection.$from.nodeAfter?.type === schema.nodes.ordered_list;
        let inList: any = undefined;
        let fromList = -1;
        const path: any = Array.from((this.view.state.selection.$from as any).path);
        for (let i = 0; i < path.length; i++) {
            if (path[i]?.type === schema.nodes.ordered_list) {
                inList = path[i];
                fromList = path[i - 1];
            }
        }

        const marks = this.view.state.storedMarks || (this.view.state.selection.$to.parentOffset && this.view.state.selection.$from.marks());
        if (inList || !wrapInList(schema.nodes.ordered_list)(this.view.state, (tx2: any) => {
            const tx3 = updateBullets(tx2, schema, nodeType && (nodeType as any).attrs.mapStyle, this.view!.state.selection.from - 1, this.view!.state.selection.to + 1);
            marks && tx3.ensureMarks([...marks]);
            marks && tx3.setStoredMarks([...marks]);

            this.view!.dispatch(tx2);
        })) {
            const tx2 = this.view.state.tr;
            if (nodeType && (inList || nextIsOL)) {
                const tx3 = updateBullets(tx2, schema, nodeType && (nodeType as any).attrs.mapStyle, inList ? fromList : this.view.state.selection.from,
                    inList ? fromList + inList.nodeSize : this.view.state.selection.to);
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
        dispatch?.(tr.replaceSelectionWith(newNode).removeMark(tr.selection.from - 1, tr.selection.from, mark));
        return true;
    }
    alignCenter = (state: EditorState<any>, dispatch: any) => {
        return this.TextView.props.isSelected(true) && this.alignParagraphs(state, "center", dispatch);
    }
    alignLeft = (state: EditorState<any>, dispatch: any) => {
        return this.TextView.props.isSelected(true) && this.alignParagraphs(state, "left", dispatch);
    }
    alignRight = (state: EditorState<any>, dispatch: any) => {
        return this.TextView.props.isSelected(true) && this.alignParagraphs(state, "right", dispatch);
    }

    alignParagraphs(state: EditorState<any>, align: "left" | "right" | "center", dispatch: any) {
        var tr = state.tr;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
            if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
                tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, align }, node.marks);
                return false;
            }
            return true;
        });
        dispatch?.(tr);
        return true;
    }

    insetParagraph(state: EditorState<any>, dispatch: any) {
        var tr = state.tr;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
            if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
                const inset = (node.attrs.inset ? Number(node.attrs.inset) : 0) + 10;
                tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, inset }, node.marks);
                return false;
            }
            return true;
        });
        dispatch?.(tr);
        return true;
    }
    outsetParagraph(state: EditorState<any>, dispatch: any) {
        var tr = state.tr;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
            if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
                const inset = Math.max(0, (node.attrs.inset ? Number(node.attrs.inset) : 0) - 10);
                tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, inset }, node.marks);
                return false;
            }
            return true;
        });
        dispatch?.(tr);
        return true;
    }

    indentParagraph(state: EditorState<any>, dispatch: any) {
        var tr = state.tr;
        let headin = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
            if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
                const nodeval = node.attrs.indent ? Number(node.attrs.indent) : undefined;
                const indent = !nodeval ? 25 : nodeval < 0 ? 0 : nodeval + 25;
                tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, indent }, node.marks);
                return false;
            }
            return true;
        });
        !headin && dispatch?.(tr);
        return true;
    }

    hangingIndentParagraph(state: EditorState<any>, dispatch: any) {
        var tr = state.tr;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node, pos, parent, index) => {
            if (node.type === schema.nodes.paragraph || node.type === schema.nodes.heading) {
                const nodeval = node.attrs.indent ? Number(node.attrs.indent) : undefined;
                const indent = !nodeval ? -25 : nodeval > 0 ? 0 : nodeval - 10;
                tr = tr.setNodeMarkup(pos, node.type, { ...node.attrs, indent }, node.marks);
                return false;
            }
            return true;
        });
        dispatch?.(tr);
        return true;
    }

    insertBlockquote(state: EditorState<any>, dispatch: any) {
        const path = (state.selection.$from as any).path;
        if (path.length > 6 && path[path.length - 6].type === schema.nodes.blockquote) {
            lift(state, dispatch);
        } else {
            wrapIn(schema.nodes.blockquote)(state, dispatch);
        }
        return true;
    }

    insertHorizontalRule(state: EditorState<any>, dispatch: any) {
        dispatch(state.tr.replaceSelectionWith(state.schema.nodes.horizontal_rule.create()).scrollIntoView());
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
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.view && self.fillBrush(self.view.state, self.view.dispatch), "rt brush");
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

        const button = <Tooltip title={<div className="dash-tooltip">style brush</div>} placement="bottom">
            <button className="antimodeMenu-button" onPointerDown={onBrushClick} style={this.brushMarks?.size > 0 ? { backgroundColor: "121212" } : {}}>
                <FontAwesomeIcon icon="paint-roller" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.brushMarks?.size > 0 ? 45 : 0}deg)` }} />
            </button>
        </Tooltip>;

        const dropdownContent =
            <div className="dropdown">
                <p>{label}</p>
                <button onPointerDown={this.clearBrush}>Clear brush</button>
                <input placeholder="-brush name-" ref={this._brushNameRef} onKeyPress={this.onBrushNameKeyPress} />
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
    get TextView() { return (this.view as any)?.TextView as FormattedTextBox; }

    createColorButton() {
        const self = this;
        function onColorClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.view && self.insertColor(self.activeFontColor, self.view.state, self.view.dispatch), "rt menu color");
            self.TextView.EditorView!.focus();
        }
        function changeColor(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.setActiveColor(color);
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.view && self.insertColor(self.activeFontColor, self.view.state, self.view.dispatch), "rt menu color");
            self.TextView.EditorView!.focus();
        }

        const button = <Tooltip title={<div className="dash-tooltip">set font color</div>} placement="bottom">
            <button className="antimodeMenu-button color-preview-button" onPointerDown={onColorClick}>
                <FontAwesomeIcon icon="palette" size="lg" />
                <div className="color-preview" style={{ backgroundColor: this.activeFontColor }}></div>
            </button>
        </Tooltip>;

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
        this.setMark(colorMark, state, dispatch, true);
    }

    @action toggleHighlightDropdown() { this.showHighlightDropdown = !this.showHighlightDropdown; }
    @action setActiveHighlight(color: string) { this.activeHighlightColor = color; }

    createHighlighterButton() {
        const self = this;
        function onHighlightClick(e: React.PointerEvent) {
            e.preventDefault();
            e.stopPropagation();
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.view && self.insertHighlight(self.activeHighlightColor, self.view.state, self.view.dispatch), "rt highligher");
        }
        function changeHighlight(e: React.PointerEvent, color: string) {
            e.preventDefault();
            e.stopPropagation();
            self.setActiveHighlight(color);
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.view && self.insertHighlight(self.activeHighlightColor, self.view.state, self.view.dispatch), "rt highlighter");
        }

        const button = <Tooltip title={<div className="dash-tooltip">set highlight color</div>} placement="bottom">
            <button className="antimodeMenu-button color-preview-button" key="highilghter-button" onPointerDown={onHighlightClick}>
                <FontAwesomeIcon icon="highlighter" size="lg" />
                <div className="color-preview" style={{ backgroundColor: this.activeHighlightColor }}></div>
            </button>
        </Tooltip>;

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
            self.TextView.endUndoTypingBatch();
            UndoManager.RunInBatch(() => self.setCurrentLink(e.target.value), "link change");
        }

        const link = this.currentLink ? this.currentLink : "";

        const button = <Tooltip title={<div className="dash-tooltip">set hyperlink</div>} placement="bottom">
            <div><FontAwesomeIcon icon="link" size="lg" /> </div>
        </Tooltip>;

        const dropdownContent =
            <div className="dropdown link-menu">
                <p>Linked to:</p>
                <input value={link} placeholder="Enter URL" onChange={onLinkChange} />
                <button className="make-button" onPointerDown={e => this.makeLinkToURL(link, "onRight")}>Apply hyperlink</button>
                <div className="divider"></div>
                <button className="remove-button" onPointerDown={e => this.deleteLink()}>Remove link</button>
            </div>;

        return <ButtonDropdown view={this.view} key={"link button"} button={button} dropdownContent={dropdownContent} openDropdownOnButton={true} />;
    }

    async getTextLinkTargetTitle() {
        if (!this.view) return;

        const node = this.view.state.selection.$from.nodeAfter;
        const link = node && node.marks.find(m => m.type.name === "link");
        if (link) {
            const href = link.attrs.allLinks.length > 0 ? link.attrs.allLinks[0].href : undefined;
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
    @undoBatch
    makeLinkToURL = (target: string, lcoation: string) => {
        ((this.view as any)?.TextView as FormattedTextBox).makeLinkToSelection("", target, "onRight", "", target);
    }

    @undoBatch
    @action
    deleteLink = () => {
        if (this.view) {
            const link = this.view.state.selection.$from.nodeAfter?.marks.find(m => m.type === this.view!.state.schema.marks.linkAnchor);
            if (link) {
                const allLinks = link.attrs.allLinks.slice();
                this.TextView.RemoveLinkFromSelection(link.attrs.allLinks);
                // bcz: Argh ... this will remove the link from the document even it's anchored somewhere else in the text which happens if only part of the anchor text was selected.
                allLinks.filter((aref: any) => aref?.href.indexOf(Utils.prepend("/doc/")) === 0).forEach((aref: any) => {
                    const linkId = aref.href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    linkId && DocServer.GetRefField(linkId).then(linkDoc => LinkManager.Instance.deleteLink(linkDoc as Doc));
                });
            }
        }
    }

    linkExtend($start: ResolvedPos, href: string) {
        const mark = this.view!.state.schema.marks.linkAnchor;

        let startIndex = $start.index();
        let endIndex = $start.indexAfter();

        while (startIndex > 0 && $start.parent.child(startIndex - 1).marks.filter(m => m.type === mark && m.attrs.allLinks.find((item: { href: string }) => item.href === href)).length) startIndex--;
        while (endIndex < $start.parent.childCount && $start.parent.child(endIndex).marks.filter(m => m.type === mark && m.attrs.allLinks.find((item: { href: string }) => item.href === href)).length) endIndex++;

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
        if (pos.nodeAfter !== null && pos.nodeAfter !== undefined) {
            if (!pos.nodeBefore || this.view.state.selection.$from.pos !== this.view.state.selection.$to.pos)
                ref_node = pos.nodeAfter;
        }
        if (!ref_node && pos.pos > 0) {
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

    @action onPointerEnter(e: React.PointerEvent) { RichTextMenu.Instance.overMenu = false; }
    @action onPointerLeave(e: React.PointerEvent) { RichTextMenu.Instance.overMenu = false; }

    @action
    toggleMenuPin = (e: React.MouseEvent) => {
        Doc.UserDoc()["menuRichText-pinned"] = this.Pinned = !this.Pinned;
        if (!this.Pinned) {
            this.fadeOut(true);
        }
    }

    @action
    protected toggleCollapse = (e: React.MouseEvent) => {
        this.collapsed = !this.collapsed;
        setTimeout(() => {
            const x = Math.min(this._left, window.innerWidth - RichTextMenu.Instance.width);
            RichTextMenu.Instance.jumpTo(x, this._top, true);
        }, 0);
    }

    render() {
        TraceMobx();
        const row1 = <div className="antimodeMenu-row" key="row 1" style={{ display: this.collapsed ? "none" : undefined }}>{[
            !this.collapsed ? this.getDragger() : (null),
            !this.Pinned ? (null) : <div key="frag1"> {[
                this.createButton("bold", "Bold", this.boldActive, toggleMark(schema.marks.strong)),
                this.createButton("italic", "Italic", this.italicsActive, toggleMark(schema.marks.em)),
                this.createButton("underline", "Underline", this.underlineActive, toggleMark(schema.marks.underline)),
                this.createButton("strikethrough", "Strikethrough", this.strikethroughActive, toggleMark(schema.marks.strikethrough)),
                this.createButton("superscript", "Superscript", this.superscriptActive, toggleMark(schema.marks.superscript)),
                this.createButton("subscript", "Subscript", this.subscriptActive, toggleMark(schema.marks.subscript)),
                <div className="richTextMenu-divider" key="divider" />
            ]}</div>,
            this.createColorButton(),
            this.createHighlighterButton(),
            this.createLinkButton(),
            this.createBrushButton(),
            <div className="richTextMenu-divider" key="divider 2" />,
            this.createButton("align-left", "Align Left", this.activeAlignment === "left", this.alignLeft),
            this.createButton("align-center", "Align Center", this.activeAlignment === "center", this.alignCenter),
            this.createButton("align-right", "Align Right", this.activeAlignment === "right", this.alignRight),
            this.createButton("indent", "Inset More", undefined, this.insetParagraph),
            this.createButton("outdent", "Inset Less", undefined, this.outsetParagraph),
            this.createButton("hand-point-left", "Hanging Indent", undefined, this.hangingIndentParagraph),
            this.createButton("hand-point-right", "Indent", undefined, this.indentParagraph),
        ]}</div>;

        const row2 = <div className="antimodeMenu-row row-2" key="row2">
            {this.collapsed ? this.getDragger() : (null)}
            <div key="row 2" style={{ display: this.collapsed ? "none" : undefined }}>
                <div className="richTextMenu-divider" key="divider 3" />,
                {[this.createMarksDropdown(this.activeFontSize, this.fontSizeOptions, "font size", action((val: string) => this.activeFontSize = val)),
                this.createMarksDropdown(this.activeFontFamily, this.fontFamilyOptions, "font family", action((val: string) => this.activeFontFamily = val)),
                <div className="richTextMenu-divider" key="divider 4" />,
                this.createNodesDropdown(this.activeListType, this.listTypeOptions, "list type", action((val: string) => this.activeListType = val)),
                this.createButton("sort-amount-down", "Summarize", undefined, this.insertSummarizer),
                this.createButton("quote-left", "Blockquote", undefined, this.insertBlockquote),
                this.createButton("minus", "Horizontal Rule", undefined, this.insertHorizontalRule),
                <div className="richTextMenu-divider" key="divider 5" />,]}
            </div>
            <div key="collapser">
                {/* <div key="collapser">
                    <button className="antimodeMenu-button" key="collapse menu" title="Collapse menu" onClick={this.toggleCollapse} style={{ backgroundColor: this.collapsed ? "#121212" : "", width: 25 }}>
                        <FontAwesomeIcon icon="chevron-left" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.3s", transform: `rotate(${this.collapsed ? 180 : 0}deg)` }} />
                    </button>
                </div> */}
                <button className="antimodeMenu-button" key="pin menu" title="Pin menu" onClick={this.toggleMenuPin} style={{ backgroundColor: this.Pinned ? "#121212" : "", display: this.collapsed ? "none" : undefined }}>
                    <FontAwesomeIcon icon="thumbtack" size="lg" style={{ transitionProperty: "transform", transitionDuration: "0.1s", transform: `rotate(${this.Pinned ? 45 : 0}deg)` }} />
                </button>
            </div>
        </div>;

        return (
            <div className="richTextMenu" onPointerEnter={this.onPointerEnter} onPointerLeave={this.onPointerLeave} >
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
export class ButtonDropdown extends React.Component<ButtonDropdownProps> {

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
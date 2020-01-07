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
import { faBold, faItalic, faUnderline, faStrikethrough, faSubscript, faSuperscript, faIndent, faEyeDropper, faCaretDown } from "@fortawesome/free-solid-svg-icons";
import { MenuItem, Dropdown } from "prosemirror-menu";
import { updateBullets } from "./ProsemirrorExampleTransfer";
import { FieldViewProps } from "../views/nodes/FieldView";
import { NumCast } from "../../new_fields/Types";
import { FormattedTextBoxProps } from "../views/nodes/FormattedTextBox";
import { unimplementedFunction } from "../../Utils";
import { wrapInList } from "prosemirror-schema-list";
import "./RichTextMenu.scss";
const { toggleMark, setBlockType } = require("prosemirror-commands");

library.add(faBold, faItalic, faUnderline, faStrikethrough, faSuperscript, faSubscript, faIndent, faEyeDropper, faCaretDown);

@observer
export default class RichTextMenu extends AntimodeMenu {
    static Instance: RichTextMenu;

    private view?: EditorView;
    private editorProps: FieldViewProps & FormattedTextBoxProps | undefined;

    @observable private activeFontSize: string = "";
    @observable private activeFontFamily: string = "";
    @observable private activeListType: string = "";

    @observable private brushIsEmpty: boolean = true;
    @observable private brushMarks: Set<Mark> = new Set();

    constructor(props: Readonly<{}>) {
        super(props);
        RichTextMenu.Instance = this;
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
        // // Don't do anything if the document/selection didn't change
        // if (lastState && lastState.doc.eq(state.doc) &&
        //     lastState.selection.eq(state.selection)) return;

        // this.reset_mark_doms();

        // // update link dropdown
        // const linkDropdown = await this.createLinkDropdown();
        // const newLinkDropdowndom = linkDropdown.render(this.view).dom;
        // this._linkDropdownDom && this.tooltip.replaceChild(newLinkDropdowndom, this._linkDropdownDom);
        // this._linkDropdownDom = newLinkDropdowndom;

        // update active font family and size
        const active = this.getActiveFontStylesOnSelection();
        const activeFamilies = active && active.get("families");
        const activeSizes = active && active.get("sizes");

        this.activeFontFamily = !activeFamilies || activeFamilies.length == 0 ? "default" : activeFamilies.length === 1 ? String(activeFamilies[0]) : "various";
        this.activeFontSize = !activeSizes || activeSizes.length == 0 ? "default" : activeSizes.length === 1 ? String(activeSizes[0]) + "pt" : "various";

        // this.update_mark_doms();
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
        state.doc.nodesBetween(from, to, (node) => node.marks?.forEach(m => found.add(m)));
        return found;
    }

    destroy() {
        console.log("destroy");
    }

    createButton(faIcon: string, title: string, command?: any, onclick?: any) {
        const self = this;
        function onClick(e: React.PointerEvent) {
            console.log("clicked button");
            // dom.addEventListener("pointerdown", e => {
            e.preventDefault();
            self.view && self.view.focus();
            //     if (dom.contains(e.target as Node)) {
            e.stopPropagation();
            //         command(this.view.state, this.view.dispatch, this.view);
            //     }
            // });
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
        let items = options.map(({ title, label, hidden }) => {
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
            options.forEach(({ label, mark, command }) => {
                if (val === label) {
                    self.view && mark && command(mark, self.view);
                }
            });
        }
        return <select onChange={e => onChange(e.target.value)}>{items}</select>;
    }

    createNodesDropdown(activeOption: string, options: { node: NodeType | any | null, title: string, label: string, command: (node: NodeType | any) => void, hidden?: boolean }[]): JSX.Element {
        let items = options.map(({ title, label, hidden }) => {
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
        console.log("change font size!!");
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
        console.log("change the list type ");
        if (!this.view) return;
        console.log("change the list type has view");

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

    createBrushButton() {
        const self = this;
        function onClick(e: React.PointerEvent) {
            console.log("clicked button");
            // dom.addEventListener("pointerdown", e => {
            e.preventDefault();
            self.view && self.view.focus();
            //     if (dom.contains(e.target as Node)) {
            e.stopPropagation();
            //         command(this.view.state, this.view.dispatch, this.view);
            //     }
            // });

            self.view && self.fillBrush(self.view.state, self.view.dispatch);

            // // update dropdown with marks
            // const newBrushDropdowndom = self.createBrushDropdown().render(self.view).dom;
            // self._brushDropdownDom && self.tooltip.replaceChild(newBrushDropdowndom, self._brushDropdownDom);
            // self._brushDropdownDom = newBrushDropdowndom;
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
                <button className="antimodeMenu-button" title="" onPointerDown={onClick}>
                    <FontAwesomeIcon icon="eye-dropper" size="lg" />
                </button>
                <button className="dropdown-button antimodeMenu-button"><FontAwesomeIcon icon="caret-down" size="sm" /></button>
                <div className="dropdown">
                    <p>{label}</p>
                    <button onPointerDown={this.clearBrush}>Clear brush</button>
                    {/* <input placeholder="Enter URL"></input> */}
                </div>
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
            // if (this._brushdom) {
            if (selected_marks.size >= 0) {
                this.brushMarks = selected_marks;
                // const newbrush = this.createBrush(true).render(this.view).dom;
                // this.tooltip.replaceChild(newbrush, this._brushdom);
                // this._brushdom = newbrush;
                this.brushIsEmpty = !this.brushIsEmpty;
                // TooltipTextMenuManager.Instance._brushIsEmpty = !TooltipTextMenuManager.Instance._brushIsEmpty;
            }
            // }
        }
        else {
            const { from, to, $from } = this.view.state.selection;
            // if (this._brushdom) {
            if (!this.view.state.selection.empty && $from && $from.nodeAfter) {
                if (this.brushMarks && to - from > 0) {
                    this.view.dispatch(this.view.state.tr.removeMark(from, to));
                    Array.from(this.brushMarks).filter(m => m.type !== schema.marks.user_mark).forEach((mark: Mark) => {
                        this.setMark(mark, this.view!.state, this.view!.dispatch);
                    });
                }
            }
            else {
                // const newbrush = this.createBrush(false).render(this.view).dom;
                // this.tooltip.replaceChild(newbrush, this._brushdom);
                // this._brushdom = newbrush;
                this.brushIsEmpty = !this.brushIsEmpty;
                // TooltipTextMenuManager.Instance._brushIsEmpty = !TooltipTextMenuManager.Instance._brushIsEmpty;
            }
            // }
        }
        console.log("brush marks are ", this.brushMarks);
    }

    // createColorButton() {
    //     const self = this;
    //     function onClick(e: React.PointerEvent) {
    //         console.log("clicked button");
    //         // dom.addEventListener("pointerdown", e => {
    //         e.preventDefault();
    //         self.view && self.view.focus();
    //         //     if (dom.contains(e.target as Node)) {
    //         e.stopPropagation();
    //         //         command(this.view.state, this.view.dispatch, this.view);
    //         //     }
    //         // });
    //         self.view && command && command(self.view!.state, self.view!.dispatch, self.view);
    //         self.view && onclick && onclick(self.view!.state, self.view!.dispatch, self.view);
    //     }

    //     return (
    //         <button className="antimodeMenu-button" title="Set font color" onPointerDown={onClick}>
    //             <FontAwesomeIcon icon={faIcon as IconProp} size="lg" />
    //         </button>
    //     );
    // }

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
            { mark: null, title: "", label: "default", command: unimplementedFunction, hidden: true },
        ]

        const fontFamilyOptions = [
            { mark: schema.marks.pFontFamily.create({ family: "Times New Roman" }), title: "Set font family", label: "Times New Roman", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Arial" }), title: "Set font family", label: "Arial", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Georgia" }), title: "Set font family", label: "Georgia", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Comic Sans MS" }), title: "Set font family", label: "Comic Sans MS", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Tahoma" }), title: "Set font family", label: "Tahoma", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Impact" }), title: "Set font family", label: "Impact", command: this.changeFontFamily },
            { mark: schema.marks.pFontFamily.create({ family: "Crimson Text" }), title: "Set font family", label: "Crimson Text", command: this.changeFontFamily },
            { mark: null, title: "", label: "various", command: unimplementedFunction, hidden: true },
            { mark: null, title: "", label: "default", command: unimplementedFunction, hidden: true },
        ]

        // //will display a remove-list-type button if selection is in list, otherwise will show list type dropdown
        // updateListItemDropdown(label: string, listTypeBtn: any) {
        //     //remove old btn
        //     if (listTypeBtn) { this.tooltip.removeChild(listTypeBtn); }

        //     //Make a dropdown of all list types
        //     const toAdd: MenuItem[] = [];
        //     this.listTypeToIcon.forEach((icon, type) => {
        //         toAdd.push(this.dropdownBulletBtn(icon, "color: black; width: 40px;", type, this.view, this.listTypes, this.changeBulletType));
        //     });
        //     //option to remove the list formatting
        //     toAdd.push(this.dropdownBulletBtn("X", "color: black; width: 40px;", undefined, this.view, this.listTypes, this.changeBulletType));

        //     listTypeBtn = (new Dropdown(toAdd, { label: label, css: "color:black; width: 40px;" }) as MenuItem).render(this.view).dom;

        //     //add this new button and return it
        //     this.tooltip.appendChild(listTypeBtn);
        //     return listTypeBtn;
        // }

        const listTypeOptions = [
            { node: schema.nodes.ordered_list.create({ mapStyle: "bullet" }), title: "Set list type", label: ":", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "decimal" }), title: "Set list type", label: "1.1", command: this.changeListType },
            { node: schema.nodes.ordered_list.create({ mapStyle: "multi" }), title: "Set list type", label: "1.A", command: this.changeListType },
            { node: undefined, title: "Set list type", label: "Remove", command: this.changeListType },
        ]

        // options: { node: NodeType | null, title: string, label: string, command: (node: NodeType) => void, hidden ?: boolean } []

        const buttons = [
            this.createButton("bold", "Bold", toggleMark(schema.marks.strong)),
            this.createButton("italic", "Italic", toggleMark(schema.marks.em)),
            this.createButton("underline", "Underline", toggleMark(schema.marks.underline)),
            this.createButton("strikethrough", "Strikethrough", toggleMark(schema.marks.strikethrough)),
            this.createButton("superscript", "Superscript", toggleMark(schema.marks.superscript)),
            this.createButton("subscript", "Subscript", toggleMark(schema.marks.subscript)),
            this.createBrushButton(),
            this.createButton("indent", "Summarize", undefined, this.insertSummarizer),
            this.createMarksDropdown(this.activeFontSize, fontSizeOptions),
            this.createMarksDropdown(this.activeFontFamily, fontFamilyOptions),
            this.createNodesDropdown(this.activeListType, listTypeOptions),
        ];

        // this._marksToDoms = new Map();
        // items.forEach(({ title, dom, command }) => {
        //     // this.tooltip.appendChild(dom);
        //     switch (title) {
        //         case "Bold":
        //             this._marksToDoms.set(schema.mark(schema.marks.strong), dom);
        //             // this.basicTools && this.basicTools.appendChild(dom.cloneNode(true));
        //             break;
        //         case "Italic":
        //             this._marksToDoms.set(schema.mark(schema.marks.em), dom);
        //             // this.basicTools && this.basicTools.appendChild(dom.cloneNode(true));
        //             break;
        //     }

        //     //pointer down handler to activate button effects
        //     dom.addEventListener("pointerdown", e => {
        //         e.preventDefault();
        //         this.view.focus();
        //         if (dom.contains(e.target as Node)) {
        //             e.stopPropagation();
        //             command(this.view.state, this.view.dispatch, this.view);
        //         }
        //     });
        // });

        return this.getElement(buttons);
    }
}
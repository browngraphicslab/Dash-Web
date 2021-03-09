import { action, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Dictionary } from "typescript-collections";
import { AclAddonly, AclAdmin, AclEdit, DataSym, Doc, Opt } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { GetEffectiveAcl } from "../../fields/util";
import { DocUtils, Docs } from "../documents/Documents";
import { CurrentUserUtils } from "../util/CurrentUserUtils";
import { DragManager } from "../util/DragManager";
import { FormattedTextBox } from "./nodes/formattedText/FormattedTextBox";
import { AnchorMenu } from "./pdf/AnchorMenu";
import "./MarqueeAnnotator.scss";
import React = require("react");
import { undoBatch } from "../util/UndoManager";
import { NumCast } from "../../fields/Types";
import { DocumentType } from "../documents/DocumentTypes";
import { List } from "../../fields/List";
const _global = (window /* browser */ || global /* node */) as any;

export interface MarqueeAnnotatorProps {
    rootDoc: Doc;
    down: number[];
    scrollTop: number;
    scaling?: () => number;
    containerOffset?: () => number[];
    mainCont: HTMLDivElement;
    savedAnnotations: Dictionary<number, HTMLDivElement[]>;
    annotationLayer: HTMLDivElement;
    addDocument: (doc: Doc) => boolean;
    getPageFromScroll?: (top: number) => number;
    finishMarquee: () => void;
}
@observer
export class MarqueeAnnotator extends React.Component<MarqueeAnnotatorProps> {
    private _startX: number = 0;
    private _startY: number = 0;
    @observable private _left: number = 0;
    @observable private _top: number = 0;
    @observable private _width: number = 0;
    @observable private _height: number = 0;

    constructor(props: any) {
        super(props);
        runInAction(() => {
            AnchorMenu.Instance.Status = "marquee";
            AnchorMenu.Instance.fadeOut(true);
            // clear out old marquees and initialize menu for new selection
            this.props.savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this.props.savedAnnotations.clear();
        });
    }

    @action componentDidMount() {
        // set marquee x and y positions to the spatially transformed position
        const boundingRect = this.props.mainCont.getBoundingClientRect();
        this._startX = this._left = (this.props.down[0] - boundingRect.left) * (this.props.mainCont.offsetWidth / boundingRect.width);
        this._startY = this._top = (this.props.down[1] - boundingRect.top) * (this.props.mainCont.offsetHeight / boundingRect.height) + this.props.mainCont.scrollTop;
        this._height = this._width = 0;
        document.addEventListener("pointermove", this.onSelectMove);
        document.addEventListener("pointerup", this.onSelectEnd);

        AnchorMenu.Instance.Highlight = this.highlight;
        /**
         * This function is used by the AnchorMenu to create an anchor highlight and a new linked text annotation.  
         * It also initiates a Drag/Drop interaction to place the text annotation.
         */
        AnchorMenu.Instance.StartDrag = action((e: PointerEvent, ele: HTMLElement) => {
            e.preventDefault();
            e.stopPropagation();
            const sourceAnchorCreator = () => {
                const annoDoc = this.highlight("rgba(173, 216, 230, 0.75)", true); // hyperlink color
                this.props.addDocument(annoDoc);
                return annoDoc;
            };
            const targetCreator = (annotationOn: Doc | undefined) => {
                const target = CurrentUserUtils.GetNewTextDoc("Note linked to " + this.props.rootDoc.title, 0, 0, 100, 100, undefined, annotationOn);
                FormattedTextBox.SelectOnLoad = target[Id];
                return target;
            };
            DragManager.StartAnchorAnnoDrag([ele], new DragManager.AnchorAnnoDragData(this.props.rootDoc, sourceAnchorCreator, targetCreator), e.pageX, e.pageY, {
                dragComplete: e => {
                    if (!e.aborted && e.annoDragData && e.annoDragData.linkSourceDoc && e.annoDragData.dropDocument && e.linkDocument) {
                        e.annoDragData.linkSourceDoc.isPushpin = e.annoDragData.dropDocument.annotationOn === this.props.rootDoc;
                    }
                }
            });
        });
    }
    componentWillUnmount() {
        document.removeEventListener("pointermove", this.onSelectMove);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }

    @undoBatch
    @action
    makeAnnotationDocument = (color: string): Opt<Doc> => {
        if (this.props.savedAnnotations.size() === 0) return undefined;
        if ((this.props.savedAnnotations.values()[0][0] as any).marqueeing) {
            const scale = this.props.scaling?.() || 1;
            const anno = this.props.savedAnnotations.values()[0][0];
            const containerOffset = this.props.containerOffset?.() || [0, 0];
            const marqueeAnno = Docs.Create.FreeformDocument([], { backgroundColor: color, annotationOn: this.props.rootDoc, title: "Annotation on " + this.props.rootDoc.title });
            marqueeAnno.x = (parseInt(anno.style.left || "0") - containerOffset[0]) / scale;
            marqueeAnno.y = (parseInt(anno.style.top || "0") - containerOffset[1]) / scale + NumCast(this.props.scrollTop);
            marqueeAnno._height = parseInt(anno.style.height || "0") / scale;
            marqueeAnno._width = parseInt(anno.style.width || "0") / scale;
            anno.remove();
            this.props.savedAnnotations.clear();
            return marqueeAnno;
        }

        const textRegionAnno = Docs.Create.FreeformDocument([], { type: DocumentType.PDFANNO, annotationOn: this.props.rootDoc, title: "Selection on " + this.props.rootDoc.title, _width: 1, _height: 1 });
        let maxX = -Number.MAX_VALUE;
        let minY = Number.MAX_VALUE;
        const annoDocs: Doc[] = [];
        this.props.savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => value.map(anno => {
            const textRegion = new Doc();
            textRegion.x = parseInt(anno.style.left ?? "0");
            textRegion.y = parseInt(anno.style.top ?? "0");
            textRegion._height = parseInt(anno.style.height ?? "0");
            textRegion._width = parseInt(anno.style.width ?? "0");
            textRegion.annoTextRegion = textRegionAnno;
            textRegion.backgroundColor = color;
            annoDocs.push(textRegion);
            anno.remove();
            minY = Math.min(NumCast(textRegion.y), minY);
            maxX = Math.max(NumCast(textRegion.x) + NumCast(textRegion._width), maxX);
        }));

        const textRegionAnnoProto = Doc.GetProto(textRegionAnno);
        textRegionAnnoProto.y = Math.max(minY, 0);
        textRegionAnnoProto.x = Math.max(maxX, 0);
        // mainAnnoDocProto.text = this._selectionText;
        textRegionAnnoProto.textInlineAnnotations = new List<Doc>(annoDocs);
        this.props.savedAnnotations.clear();
        return textRegionAnno;
    }
    @action
    highlight = (color: string, isLinkButton: boolean) => {
        // creates annotation documents for current highlights
        const effectiveAcl = GetEffectiveAcl(this.props.rootDoc[DataSym]);
        const annotationDoc = [AclAddonly, AclEdit, AclAdmin].includes(effectiveAcl) && this.makeAnnotationDocument(color);
        annotationDoc && this.props.addDocument(annotationDoc);
        annotationDoc && (annotationDoc.isLinkButton = isLinkButton);
        return annotationDoc as Doc ?? undefined;
    }

    public static previewNewAnnotation = action((savedAnnotations: Dictionary<number, HTMLDivElement[]>, annotationLayer: HTMLDivElement, div: HTMLDivElement, page: number) => {
        if (div.style.top) {
            div.style.top = (parseInt(div.style.top)/*+ this.getScrollFromPage(page)*/).toString();
        }
        annotationLayer.append(div);
        div.style.backgroundColor = "#ACCEF7";
        div.style.opacity = "0.5";
        const savedPage = savedAnnotations.getValue(page);
        if (savedPage) {
            savedPage.push(div);
            savedAnnotations.setValue(page, savedPage);
        }
        else {
            savedAnnotations.setValue(page, [div]);
        }
    });

    @action
    onSelectMove = (e: PointerEvent) => {
        // transform positions and find the width and height to set the marquee to
        const boundingRect = this.props.mainCont.getBoundingClientRect();
        this._width = ((e.clientX - boundingRect.left) * (this.props.mainCont.offsetWidth / boundingRect.width)) - this._startX;
        this._height = ((e.clientY - boundingRect.top) * (this.props.mainCont.offsetHeight / boundingRect.height)) - this._startY + this.props.mainCont.scrollTop;
        this._left = Math.min(this._startX, this._startX + this._width);
        this._top = Math.min(this._startY, this._startY + this._height);
        this._width = Math.abs(this._width);
        this._height = Math.abs(this._height);
        e.stopPropagation();
    }

    onSelectEnd = (e: PointerEvent) => {
        if (!e.ctrlKey) {
            AnchorMenu.Instance.Marquee = { left: this._left, top: this._top, width: this._width, height: this._height };
        }

        if (this._width > 10 || this._height > 10) {  // configure and show the annotation/link menu if a the drag region is big enough
            const marquees = this.props.mainCont.getElementsByClassName("marqueeAnnotator-dragBox");
            if (marquees?.length) { // copy the temporary marquee to allow for multiple selections (not currently available though).
                const copy = document.createElement("div");
                ["left", "top", "width", "height", "border", "opacity"].forEach(prop => copy.style[prop as any] = (marquees[0] as HTMLDivElement).style[prop as any]);
                copy.className = "marqueeAnnotator-annotationBox";
                (copy as any).marqueeing = true;
                MarqueeAnnotator.previewNewAnnotation(this.props.savedAnnotations, this.props.annotationLayer, copy, this.props.getPageFromScroll?.(this._top) || 0);
            }

            AnchorMenu.Instance.jumpTo(e.clientX, e.clientY);

            if (AnchorMenu.Instance.Highlighting) {// when highlighter has been toggled when menu is pinned, we auto-highlight immediately on mouse up
                this.highlight("rgba(245, 230, 95, 0.75)", false);  // yellowish highlight color for highlighted text (should match AnchorMenu's highlight color)
            }
        } else {
            runInAction(() => this._width = this._height = 0);
        }
        this.props.finishMarquee();
    }

    render() {
        return <div className="marqueeAnnotator-dragBox"
            style={{
                left: `${this._left}px`, top: `${this._top}px`,
                width: `${this._width}px`, height: `${this._height}px`,
                border: `${this._width === 0 ? "" : "2px dashed black"}`,
                opacity: 0.2
            }}>
        </div>;
    }
}

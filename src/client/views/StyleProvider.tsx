import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { runInAction } from 'mobx';
import { Doc, Opt, StrListCast } from "../../fields/Doc";
import { List } from '../../fields/List';
import { listSpec } from '../../fields/Schema';
import { BoolCast, Cast, NumCast, StrCast } from "../../fields/Types";
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { SnappingManager } from '../util/SnappingManager';
import { UndoManager } from '../util/UndoManager';
import { CollectionViewType } from './collections/CollectionView';
import { MainView } from './MainView';
import { DocumentViewProps } from "./nodes/DocumentView";
import "./StyleProvider.scss";
import "./collections/TreeView.scss";
import "./nodes/FilterBox.scss";
import React = require("react");
import Color = require('color');
import { FieldViewProps } from './nodes/FieldView';

export enum StyleLayers {
    Background = "background"
}

export enum StyleProp {
    TreeViewIcon = "treeViewIcon",
    DocContents = "docContents",          // when specified, the JSX returned will replace the normal rendering of the document view
    Opacity = "opacity",                  // opacity of the document view
    Hidden = "hidden",                    // whether the document view should not be isplayed
    BoxShadow = "boxShadow",              // box shadow - used for making collections standout and for showing clusters in free form views
    BorderRounding = "borderRounding",    // border radius of the document view
    Color = "color",                      // foreground color of Document view items
    BackgroundColor = "backgroundColor",  // background color of a document view
    WidgetColor = "widgetColor",          // color to display UI widgets on a document view -- used for the sidebar divider dragger on a text note
    HideLinkButton = "hideLinkButton",    // hides the blue-dot link button.  used when a document acts like a button
    LinkSource = "linkSource",            // source document of a link -- used by LinkAnchorBox
    PointerEvents = "pointerEvents",      // pointer events for DocumentView -- inherits pointer events if not specified
    Decorations = "decorations",          // additional decoration to display above a DocumentView -- currently only used to display a Lock for making things background
    HeaderMargin = "headerMargin",        // margin at top of documentview, typically for displaying a title -- doc contents will start below that
    TitleHeight = "titleHeight",          // Height of Title area
    ShowTitle = "showTitle",              // whether to display a title on a Document (optional :hover suffix)
}

function darkScheme() { return BoolCast(CurrentUserUtils.ActiveDashboard?.darkScheme); }

function toggleBackground(doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        const layers = StrListCast(doc._layerTags);
        if (!layers.includes(StyleLayers.Background)) {
            if (!layers.length) doc._layerTags = new List<string>([StyleLayers.Background]);
            else layers.push(StyleLayers.Background);
        }
        else layers.splice(layers.indexOf(StyleLayers.Background), 1);
    }), "toggleBackground");
}

export function testDocProps(toBeDetermined: any): toBeDetermined is DocumentViewProps {
    return (toBeDetermined?.isContentActive) ? toBeDetermined : undefined;
}

//
// a preliminary implementation of a dash style sheet for setting rendering properties of documents nested within a Tab
// 
export function DefaultStyleProvider(doc: Opt<Doc>, props: Opt<DocumentViewProps>, property: string): any {
    const docProps = testDocProps(props) ? props : undefined;
    const selected = property.includes(":selected");
    const isCaption = property.includes(":caption");
    const isAnchor = property.includes(":anchor");
    const isAnnotated = property.includes(":annotated");
    const isOpen = property.includes(":open");
    const isBackground = () => StrListCast(doc?._layerTags).includes(StyleLayers.Background);
    const backgroundCol = () => props?.styleProvider?.(doc, props, StyleProp.BackgroundColor);
    const opacity = () => props?.styleProvider?.(doc, props, StyleProp.Opacity);
    const showTitle = () => props?.styleProvider?.(doc, props, StyleProp.ShowTitle);

    switch (property.split(":")[0]) {
        case StyleProp.TreeViewIcon: return Doc.toIcon(doc, isOpen);
        case StyleProp.DocContents: return undefined;
        case StyleProp.WidgetColor: return isAnnotated ? "lightBlue" : darkScheme() ? "lightgrey" : "dimgrey";
        case StyleProp.Opacity: return Cast(doc?._opacity, "number", Cast(doc?.opacity, "number", null));
        case StyleProp.HideLinkButton: return props?.hideLinkButton || (!selected && (doc?.isLinkButton || doc?.hideLinkButton));
        case StyleProp.ShowTitle: return doc && !doc.presentationTargetDoc && StrCast(doc._showTitle,
            !Doc.IsSystem(doc) && doc.type === DocumentType.RTF ?
                (doc.author === Doc.CurrentUserEmail ? StrCast(Doc.UserDoc().showTitle) : "author;creationDate") : "") || "";
        case StyleProp.Color:
            if (isCaption) return "white";
            const backColor = backgroundCol() || "black";
            const col = Color(backColor).rgb();
            const colsum = (col.red() + col.green() + col.blue());
            if (colsum / col.alpha() > 400 || col.alpha() < 0.25) return "black";
            return "white";
        case StyleProp.Hidden: return BoolCast(doc?._hidden);
        case StyleProp.BorderRounding: return StrCast(doc?._borderRounding);
        case StyleProp.TitleHeight: return 15;
        case StyleProp.HeaderMargin: return ([CollectionViewType.Stacking, CollectionViewType.Masonry].includes(doc?._viewType as any) ||
            doc?.type === DocumentType.RTF) && showTitle() && !StrCast(doc?.showTitle).includes(":hover") ? 15 : 0;
        case StyleProp.BackgroundColor: {
            if (isCaption) return "rgba(0,0,0 ,0.4)";
            if (Doc.UserDoc().renderStyle === "comic") return "transparent";
            let docColor: Opt<string> = StrCast(doc?._backgroundColor);
            if (MainView.Instance.LastButton === doc) return darkScheme() ? "dimgrey" : "lightgrey";
            switch (doc?.type) {
                case DocumentType.PRESELEMENT: docColor = docColor || (darkScheme() ? "" : ""); break;
                case DocumentType.PRES: docColor = docColor || (darkScheme() ? "#3e3e3e" : "white"); break;
                case DocumentType.FONTICON: docColor = docColor || "black"; break;
                case DocumentType.RTF: docColor = docColor || (darkScheme() ? "#2d2d2d" : "#f1efeb"); break;
                case DocumentType.FILTER: docColor = docColor || (darkScheme() ? "#2d2d2d" : "rgba(105, 105, 105, 0.432)"); break;
                case DocumentType.INK: docColor = doc?.isInkMask ? "rgba(0,0,0,0.7)" : undefined; break;
                case DocumentType.SLIDER: break;
                case DocumentType.EQUATION: docColor = docColor || "transparent"; break;
                case DocumentType.LABEL: docColor = docColor || (doc.annotationOn !== undefined ? "rgba(128, 128, 128, 0.18)" : undefined); break;
                case DocumentType.BUTTON: docColor = docColor || (darkScheme() ? "#2d2d2d" : "lightgray"); break;
                case DocumentType.LINKANCHOR: docColor = isAnchor ? "lightblue" : "transparent"; break;
                case DocumentType.LINK: docColor = docColor || "transparent"; break;
                case DocumentType.WEB:
                case DocumentType.PDF:
                case DocumentType.SCREENSHOT:
                case DocumentType.VID: docColor = docColor || (darkScheme() ? "#2d2d2d" : "lightgray"); break;
                case DocumentType.COL:
                    if (StrCast(Doc.LayoutField(doc)).includes("SliderBox")) break;
                    docColor = docColor ? docColor :
                        doc?._isGroup ? "#00000004" : // very faint highlight to show bounds of group
                            (Doc.IsSystem(doc) ? (darkScheme() ? "rgb(62,62,62)" : "lightgrey") : // system docs (seen in treeView) get a grayish background
                                isBackground() ? "cyan" : // ?? is there a good default for a background collection
                                    doc.annotationOn ? "#00000015" : // faint interior for collections on PDFs, images, etc
                                        StrCast((props?.renderDepth || 0) > 0 ?
                                            Doc.UserDoc().activeCollectionNestedBackground :
                                            Doc.UserDoc().activeCollectionBackground));
                    break;
                //if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                default: docColor = darkScheme() ? "black" : "white"; break;
            }
            if (docColor && (!doc || props?.layerProvider?.(doc) === false)) docColor = Color(docColor.toLowerCase()).fade(0.5).toString();
            return docColor;
        }
        case StyleProp.BoxShadow: {
            if (!doc || opacity() === 0) return undefined;  // if it's not visible, then no shadow)

            if (doc?.isLinkButton && doc.type !== DocumentType.LINK) return StrCast(doc?._linkButtonShadow, "lightblue 0em 0em 1em");

            switch (doc?.type) {
                case DocumentType.COL:
                    return StrCast(doc?.boxShadow,
                        isBackground() || doc?._isGroup || docProps?.LayoutTemplateString ? undefined : // groups have no drop shadow -- they're supposed to be "invisible".  LayoutString's imply collection is being rendered as something else (e.g., title of a Slide)
                            `${darkScheme() ? "rgb(30, 32, 31) " : "#9c9396 "} ${StrCast(doc.boxShadow, "0.2vw 0.2vw 0.8vw")}`);

                case DocumentType.LABEL:
                    if (doc?.annotationOn !== undefined) return "black 2px 2px 1px";
                default:
                    return doc.z ? `#9c9396  ${StrCast(doc?.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                        props?.ContainingCollectionDoc?._useClusters && doc.type !== DocumentType.INK ? (`${backgroundCol()} ${StrCast(doc.boxShadow, `0vw 0vw ${(isBackground() ? 100 : 50) / (docProps?.ContentScaling?.() || 1)}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                            NumCast(doc.group, -1) !== -1 && doc.type !== DocumentType.INK ? (`gray ${StrCast(doc.boxShadow, `0vw 0vw ${(isBackground() ? 100 : 50) / (docProps?.ContentScaling?.() || 1)}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                isBackground() ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
                                    StrCast(doc.boxShadow, "");
            }
        }
        case StyleProp.PointerEvents:
            if (props?.pointerEvents === "none") return "none";
            const layer = doc && props?.layerProvider?.(doc);
            if (opacity() === 0 || (doc?.type === DocumentType.INK && !docProps?.treeViewDoc) || doc?.isInkMask) return "none";
            if (layer === false && !selected && !SnappingManager.GetIsDragging()) return "none";
            if (doc?.type !== DocumentType.INK && layer === true) return "all";
            return undefined;
        case StyleProp.Decorations:
            // if (isFooter)

            if (props?.ContainingCollectionDoc?._viewType === CollectionViewType.Freeform) {
                return doc && (isBackground() || selected) && (props?.renderDepth || 0) > 0 &&
                    ((doc.type === DocumentType.COL && doc._viewType !== CollectionViewType.Pile) || [DocumentType.RTF, DocumentType.IMG, DocumentType.INK].includes(doc.type as DocumentType)) ?
                    <div className="styleProvider-lock" onClick={() => toggleBackground(doc)}>
                        <FontAwesomeIcon icon={isBackground() ? "unlock" : "lock"} style={{ color: isBackground() ? "red" : undefined }} size="lg" />
                    </div>
                    : (null);
            }
    }
}


function toggleHidden(e: React.MouseEvent, doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        e.stopPropagation();
        doc.hidden = doc.hidden ? undefined : true;
    }), "toggleHidden");
}

function toggleLock(e: React.MouseEvent, doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        e.stopPropagation();
        doc.lockedPosition = doc.lockedPosition ? undefined : true;
    }), "toggleHidden");
}

/**
 * add lock and hide button decorations for the "Dashboards" flyout TreeView
 */
export function DashboardStyleProvider(doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) {
    switch (property.split(":")[0]) {
        case StyleProp.Decorations:
            if (doc) {
                const hidden = doc.hidden;
                const locked = doc.lockedPosition;
                return doc._viewType === CollectionViewType.Docking || (Doc.IsSystem(doc) && Doc.UserDoc().noviceMode) ? (null) :
                    <>
                        <div className={`styleProvider-treeView-hide${hidden ? "-active" : ""}`} onClick={(e) => toggleHidden(e, doc)}>
                            <FontAwesomeIcon icon={hidden ? "eye-slash" : "eye"} size="sm" />
                        </div>
                        <div className={`styleProvider-treeView-lock${locked ? "-active" : ""}`} onClick={(e) => toggleLock(e, doc)}>
                            <FontAwesomeIcon icon={locked ? "lock" : "unlock"} size="sm" />
                        </div>
                    </>;
            }
        default: return DefaultStyleProvider(doc, props, property);

    }
}

function changeFilterBool(e: any, doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        //e.stopPropagation();
        //doc.lockedPosition = doc.lockedPosition ? undefined : true;
    }), "changeFilterBool");
}

function closeFilter(e: React.MouseEvent, doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        e.stopPropagation();
        //doc.lockedPosition = doc.lockedPosition ? undefined : true;
    }), "closeFilter");
}


/**
 * add (to treeView) for filtering decorations
 */
export function FilteringStyleProvider(doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) {
    switch (property.split(":")[0]) {
        case StyleProp.Decorations:
            if (doc) {
                return doc._viewType === CollectionViewType.Docking || (Doc.IsSystem(doc)) ? (null) :
                    <>
                        <div>
                            <select className="filterBox-treeView-selection" onChange={e => changeFilterBool(e, doc)}>
                                <option value="Is" key="Is">Is</option>
                                <option value="Is Not" key="Is Not">Is Not</option>
                            </select>
                        </div>
                        <div className="filterBox-treeView-close" onClick={(e) => closeFilter(e, doc)}>
                            <FontAwesomeIcon icon={"times"} size="sm" />
                        </div>
                    </>;
            }
        default: return DefaultStyleProvider(doc, props, property);

    }
}

//
// a preliminary semantic-"layering/grouping" mechanism for determining interactive properties of documents
//  currently, the provider tests whether the docuemnt's layer field matches the activeLayer field of the tab.
//     if it matches, then the document gets pointer events, otherwise it does not.
//
export function DefaultLayerProvider(thisDoc: Doc) {
    return (doc: Doc, assign?: boolean) => {
        if (doc.z) return true;
        if (assign) {
            const activeLayer = StrCast(thisDoc?.activeLayer);
            if (activeLayer) {
                const layers = Cast(doc._layerTags, listSpec("string"), []);
                if (layers.length && !layers.includes(activeLayer)) layers.push(activeLayer);
                else if (!layers.length) doc._layerTags = new List<string>([activeLayer]);
                if (activeLayer === "red" || activeLayer === "green" || activeLayer === "blue") doc._backgroundColor = activeLayer;
            }
            return true;
        } else {
            if (Doc.AreProtosEqual(doc, thisDoc)) return true;
            const layers = StrListCast(doc._layerTags);
            if (!layers.length && !thisDoc?.activeLayer) return true;
            if (layers.includes(StrCast(thisDoc?.activeLayer))) return true;
            return false;
        }
    };
}
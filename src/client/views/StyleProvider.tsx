import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { runInAction } from 'mobx';
import { Doc, Opt, StrListCast } from "../../fields/Doc";
import { List } from '../../fields/List';
import { BoolCast, Cast, StrCast } from "../../fields/Types";
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { SnappingManager } from '../util/SnappingManager';
import { UndoManager } from '../util/UndoManager';
import { CollectionViewType } from './collections/CollectionView';
import { DocumentViewProps } from "./nodes/DocumentView";
import "./StyleProvider.scss";
import React = require("react");
import Color = require('color');
import { listSpec } from '../../fields/Schema';

export enum StyleLayers {
    Background = "background"
}

export enum StyleProp {
    DocContents = "docContents",
    Opacity = "opacity",
    Hidden = "hidden",
    BoxShadow = "boxShadow",
    BorderRounding = "borderRounding",
    BackgroundColor = "backgroundColor",
    WidgetColor = "widgetColor",
    LinkBackgroundColor = "linkBackgroundColor",
    HideLinkButton = "hideLinkButton",
    LinkSource = "linkSource",
    PointerEvents = "pointerEvents",
    Decorations = "decorations",
}

function darkScheme() { return BoolCast(CurrentUserUtils.ActiveDashboard?.darkScheme); }

function toggleBackground(doc: Doc) {
    UndoManager.RunInBatch(() => runInAction(() => {
        const layers = StrListCast(doc.layers);
        if (!layers.includes(StyleLayers.Background)) {
            if (!layers.length) doc.layers = new List<string>([StyleLayers.Background]);
            else layers.push(StyleLayers.Background);
        }
        else layers.splice(layers.indexOf(StyleLayers.Background), 1);
        doc._overflow = !layers.includes(StyleLayers.Background) ? "visible" : undefined;
        if (!layers.includes(StyleLayers.Background)) {
            //this.props.bringToFront(doc, true);
            // const wid = this.Document[WidthSym]();    // change the nativewidth and height if the background is to be a collection that aggregates stuff that is added to it.
            // const hgt = this.Document[HeightSym]();
            // Doc.SetNativeWidth(this.props.Document[DataSym], wid);
            // Doc.SetNativeHeight(this.props.Document[DataSym], hgt);
        }
    }), "toggleBackground");
}

//
// a preliminary implementation of a dash style sheet for setting rendering properties of documents nested within a Tab
// 
export function DefaultStyleProvider(doc: Opt<Doc>, props: Opt<DocumentViewProps>, property: string): any {
    switch (property.split(":")[0]) {
        case StyleProp.DocContents: return undefined;
        case StyleProp.WidgetColor: return darkScheme() ? "lightgrey" : "dimgrey";
        case StyleProp.Opacity: return Cast(doc?._opacity, "number", Cast(doc?.opacity, "number", null));
        case StyleProp.Hidden: return BoolCast(doc?._hidden, BoolCast(doc?.hidden));
        case StyleProp.BorderRounding: return !doc ? undefined : StrCast(doc._borderRounding, StrCast(doc.borderRounding));
        case StyleProp.BackgroundColor: {
            if (Doc.UserDoc().renderStyle === "comic") return undefined;
            let docColor: Opt<string> = StrCast(doc?._backgroundColor, StrCast(doc?.backgroundColor));
            if (!docColor) {
                switch (doc?.type) {
                    case DocumentType.PRESELEMENT: docColor = darkScheme() ? "" : ""; break;
                    case DocumentType.PRES: docColor = darkScheme() ? "#3e3e3e" : "white"; break;
                    case DocumentType.FONTICON: docColor = "black"; break;
                    case DocumentType.RTF: docColor = darkScheme() ? "#2d2d2d" : "#f1efeb"; break;
                    case DocumentType.LABEL:
                    case DocumentType.BUTTON: docColor = darkScheme() ? "#2d2d2d" : "lightgray"; break;
                    case DocumentType.LINK:
                    case DocumentType.COL:
                        docColor = Doc.IsSystem(doc) ? (darkScheme() ? "rgb(62,62,62)" : "lightgrey") :
                            StrListCast(doc.layers).includes(StyleLayers.Background) ? "cyan" :
                                doc.annotationOn ? "#00000015" :
                                    StrCast((props?.renderDepth || 0) > 0 ?
                                        Doc.UserDoc().activeCollectionNestedBackground :
                                        Doc.UserDoc().activeCollectionBackground);
                        break;
                    //if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                    default: docColor = darkScheme() ? "black" : "white"; break;
                }
            }
            if (docColor && (!doc || props?.layerProvider?.(doc) === false)) docColor = Color(docColor.toLowerCase()).fade(0.5).toString();
            return docColor;
        }
        case StyleProp.BoxShadow: {
            if (!doc || props?.styleProvider?.(doc, props, StyleProp.Opacity) === 0) return undefined;  // if it's not visible, then no shadow)
            const isBackground = StrListCast(doc.layers).includes(StyleLayers.Background);
            switch (doc?.type) {
                case DocumentType.COL: return isBackground ? undefined :
                    `${darkScheme() ? "rgb(30, 32, 31) " : "#9c9396 "} ${StrCast(doc.boxShadow, "0.2vw 0.2vw 0.8vw")}`;
                default:
                    return doc.z ? `#9c9396  ${StrCast(doc?.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                        props?.backgroundHalo?.(doc) && doc.type !== DocumentType.INK ? (`${props?.styleProvider?.(doc, props, StyleProp.BackgroundColor)} ${StrCast(doc.boxShadow, `0vw 0vw ${(isBackground ? 100 : 50) / props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                            isBackground ? undefined :  // if it's a background & has a cluster color, make the shadow spread really big
                                StrCast(doc.boxShadow, "");
            }
        }
        case StyleProp.PointerEvents:
            const layer = doc && props?.layerProvider?.(doc);
            if (props?.styleProvider?.(doc, props, StyleProp.Opacity) === 0 || doc?.type === DocumentType.INK || doc?.isInkMask) return "none";
            if (layer === false && !property.includes(":selected") && !SnappingManager.GetIsDragging()) return "none";
            if (doc?.type !== DocumentType.INK && layer === true) return "all";
            return undefined;
        case StyleProp.Decorations:
            if (props?.ContainingCollectionDoc?._viewType === CollectionViewType.Freeform) {
                const isBackground = StrListCast(doc?.layers).includes(StyleLayers.Background);
                return doc && (isBackground || property.includes(":selected")) && (props?.renderDepth || 0) > 0 &&
                    ((doc.type === DocumentType.COL && doc._viewType !== CollectionViewType.Pile) || [DocumentType.RTF, DocumentType.IMG, DocumentType.INK].includes(doc.type as DocumentType)) ?
                    <div className="styleProvider-lock" onClick={() => toggleBackground(doc)}>
                        <FontAwesomeIcon icon={isBackground ? "unlock" : "lock"} style={{ color: isBackground ? "red" : undefined }} size="lg" />
                    </div>
                    : (null);
            }
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
                const layers = Cast(doc.layers, listSpec("string"), []);
                if (layers.length && !layers.includes(activeLayer)) layers.push(activeLayer);
                else if (!layers.length) doc.layers = new List<string>([activeLayer]);
                if (activeLayer === "red" || activeLayer === "green" || activeLayer === "blue") doc._backgroundColor = activeLayer;
            }
            return true;
        } else {
            if (Doc.AreProtosEqual(doc, thisDoc)) return true;
            const layers = Cast(doc.layers, listSpec("string"), []);
            if (!layers.length && !thisDoc?.activeLayer) return true;
            if (layers.includes(StrCast(thisDoc?.activeLayer))) return true;
            return false;
        }
    };
}
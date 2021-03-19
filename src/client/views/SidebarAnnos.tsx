import { computed } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCast, StrListCast } from "../../fields/Doc";
import { Id } from '../../fields/FieldSymbols';
import { List } from '../../fields/List';
import { NumCast, StrCast } from '../../fields/Types';
import { emptyFunction, OmitKeys, returnOne, returnTrue, returnZero } from '../../Utils';
import { Docs, DocUtils } from '../documents/Documents';
import { Transform } from '../util/Transform';
import { CollectionStackingView } from './collections/CollectionStackingView';
import { CollectionViewType } from './collections/CollectionView';
import { FieldViewProps } from './nodes/FieldView';
import { FormattedTextBox } from './nodes/formattedText/FormattedTextBox';
import { SearchBox } from './search/SearchBox';
import "./SidebarAnnos.scss";
import { StyleProp } from './StyleProvider';
import React = require("react");

interface extraProps {
    fieldKey: string;
    layoutDoc: Doc;
    rootDoc: Doc;
    dataDoc: Doc;
    annotationsActive: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    ScreenToLocalTransform: () => Transform;
    addDocument: (doc: (Doc | Doc[]), suffix: string) => boolean;
    removeDocument: (doc: (Doc | Doc[]), suffix: string) => boolean;
    moveDocument: (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean, annotationKey?: string) => boolean;
}
@observer
export class SidebarAnnos extends React.Component<FieldViewProps & extraProps> {
    _stackRef = React.createRef<CollectionStackingView>();
    @computed get allHashtags() {
        const keys = new Set<string>();
        DocListCast(this.props.rootDoc[this.sidebarKey()]).forEach(doc => SearchBox.documentKeys(doc).forEach(key => keys.add(key)));
        return Array.from(keys.keys()).filter(key => key[0]).filter(key => !key.startsWith("_") && (key[0] === "#" || key[0] === key[0].toUpperCase())).sort();
    }
    get filtersKey() { return "_" + this.sidebarKey() + "-docFilters"; }

    anchorMenuClick = (anchor: Doc) => {
        this.props.layoutDoc._showSidebar = true;
        const startup = StrListCast(this.props.rootDoc.docFilters).map(filter => filter.split(":")[0]).join(" ");
        const target = Docs.Create.TextDocument(startup, {
            title: "anno",
            annotationOn: this.props.rootDoc, _width: 200, _height: 50, _fitWidth: true, _autoHeight: true, _fontSize: StrCast(Doc.UserDoc().fontSize),
            _fontFamily: StrCast(Doc.UserDoc().fontFamily)
        });
        FormattedTextBox.SelectOnLoad = target[Id];
        FormattedTextBox.DontSelectInitialText = true;
        this.allHashtags.map(tag => target[tag] = tag);
        DocUtils.MakeLink({ doc: anchor }, { doc: target }, "inline markup", "annotation");
        this.addDocument(target);
        this._stackRef.current?.focusDocument(target);
    }
    makeDocUnfiltered = (doc: Doc) => {
        if (DocListCast(this.props.rootDoc[this.sidebarKey()]).includes(doc)) {
            if (this.props.layoutDoc[this.filtersKey]) {
                this.props.layoutDoc[this.filtersKey] = new List<string>();
                return true;
            }
        }
        return false;
    }
    sidebarKey = () => this.props.fieldKey + "-sidebar";
    filtersHeight = () => 50;
    screenToLocalTransform = () => this.props.ScreenToLocalTransform().translate(Doc.NativeWidth(this.props.dataDoc), 0).scale(this.props.scaling?.() || 1);
    panelWidth = () => !this.props.layoutDoc._showSidebar ? 0 : (NumCast(this.props.layoutDoc.nativeWidth) - Doc.NativeWidth(this.props.dataDoc)) * this.props.PanelWidth() / NumCast(this.props.layoutDoc.nativeWidth);
    panelHeight = () => this.props.PanelHeight() - this.filtersHeight() - 20;
    addDocument = (doc: Doc | Doc[]) => this.props.addDocument(doc, this.sidebarKey());
    moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean) => this.props.moveDocument(doc, targetCollection, addDocument, this.sidebarKey());
    removeDocument = (doc: Doc | Doc[]) => this.props.removeDocument(doc, this.sidebarKey());
    docFilters = () => [...StrListCast(this.props.layoutDoc._docFilters), ...StrListCast(this.props.layoutDoc[this.filtersKey])];

    render() {
        const renderTag = (tag: string) => {
            const active = StrListCast(this.props.rootDoc[this.filtersKey]).includes(`${tag}:${tag}:check`);
            return <div key={tag} className={`sidebarAnnos-filterTag${active ? "-active" : ""}`}
                onClick={e => Doc.setDocFilter(this.props.rootDoc, tag, tag, "check", true, this.sidebarKey(), e.shiftKey)}>
                {tag}
            </div>;
        }
        return !this.props.layoutDoc._showSidebar ? (null) :
            <div style={{
                position: "absolute", pointerEvents: this.props.active() ? "all" : undefined, top: 0, right: 0,
                background: this.props.styleProvider?.(this.props.rootDoc, this.props, StyleProp.WidgetColor),
                width: `${this.panelWidth()}px`,
                height: "100%"
            }}>
                <div style={{ width: "100%", height: this.panelHeight(), position: "relative" }}>
                    <CollectionStackingView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit} ref={this._stackRef}
                        NativeWidth={returnZero}
                        NativeHeight={returnZero}
                        PanelHeight={this.panelHeight}
                        PanelWidth={this.panelWidth}
                        xMargin={0}
                        yMargin={0}
                        docFilters={this.docFilters}
                        chromeStatus={"enabled"}
                        scaleField={this.sidebarKey() + "-scale"}
                        isAnnotationOverlay={false}
                        select={emptyFunction}
                        active={this.props.annotationsActive}
                        scaling={returnOne}
                        whenActiveChanged={this.props.whenActiveChanged}
                        childHideDecorationTitle={returnTrue}
                        removeDocument={this.removeDocument}
                        moveDocument={this.moveDocument}
                        addDocument={this.addDocument}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.screenToLocalTransform}
                        renderDepth={this.props.renderDepth + 1}
                        viewType={CollectionViewType.Stacking}
                        fieldKey={this.sidebarKey()}
                        pointerEvents={"all"}
                    />
                </div>
                <div className="sidebarAnnos-tagList" style={{ height: this.filtersHeight(), width: this.panelWidth() }}>
                    {this.allHashtags.map(renderTag)}
                </div>
            </div>;
    }
}
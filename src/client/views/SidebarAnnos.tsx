import { computed } from 'mobx';
import { observer } from "mobx-react";
import { Doc, DocListCast, StrListCast, Opt } from "../../fields/Doc";
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
import { DocumentViewProps } from './nodes/DocumentView';
import { DocumentType } from '../documents/DocumentTypes';

interface ExtraProps {
    fieldKey: string;
    layoutDoc: Doc;
    rootDoc: Doc;
    dataDoc: Doc;
    whenChildContentsActiveChanged: (isActive: boolean) => void;
    ScreenToLocalTransform: () => Transform;
    sidebarAddDocument: (doc: (Doc | Doc[]), suffix: string) => boolean;
    removeDocument: (doc: (Doc | Doc[]), suffix: string) => boolean;
    moveDocument: (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean, annotationKey?: string) => boolean;
}
@observer
export class SidebarAnnos extends React.Component<FieldViewProps & ExtraProps> {
    constructor(props: Readonly<FieldViewProps & ExtraProps>) {
        super(props);
        this.props.dataDoc[this.sidebarKey] = new List<Doc>();
    }
    _stackRef = React.createRef<CollectionStackingView>();
    @computed get allHashtags() {
        const keys = new Set<string>();
        DocListCast(this.props.rootDoc[this.sidebarKey]).forEach(doc => SearchBox.documentKeys(doc).forEach(key => keys.add(key)));
        return Array.from(keys.keys()).filter(key => key[0]).filter(key => !key.startsWith("_") && (key[0] === "#" || key[0] === key[0].toUpperCase())).sort();
    }
    @computed get allUsers() {
        const keys = new Set<string>();
        DocListCast(this.props.rootDoc[this.sidebarKey]).forEach(doc => keys.add(StrCast(doc.author)));
        return Array.from(keys.keys()).sort();
    }
    get filtersKey() { return "_" + this.sidebarKey + "-docFilters"; }

    anchorMenuClick = (anchor: Doc) => {
        const startup = StrListCast(this.props.rootDoc.docFilters).map(filter => filter.split(":")[0]).join(" ");
        const target = Docs.Create.TextDocument(startup, {
            title: "-note-",
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
        if (DocListCast(this.props.rootDoc[this.sidebarKey]).includes(doc)) {
            if (this.props.layoutDoc[this.filtersKey]) {
                this.props.layoutDoc[this.filtersKey] = new List<string>();
                return true;
            }
        }
        return false;
    }

    get sidebarKey() { return this.props.fieldKey + "-sidebar"; }
    filtersHeight = () => 38;
    screenToLocalTransform = () => this.props.ScreenToLocalTransform().translate(Doc.NativeWidth(this.props.dataDoc), 0).scale(this.props.scaling?.() || 1);
    panelWidth = () => !this.props.layoutDoc._showSidebar ? 0 : this.props.layoutDoc.type === DocumentType.RTF ? this.props.PanelWidth() : (NumCast(this.props.layoutDoc.nativeWidth) - Doc.NativeWidth(this.props.dataDoc)) * this.props.PanelWidth() / NumCast(this.props.layoutDoc.nativeWidth);
    panelHeight = () => this.props.PanelHeight() - this.filtersHeight();
    addDocument = (doc: Doc | Doc[]) => this.props.sidebarAddDocument(doc, this.sidebarKey);
    moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean) => this.props.moveDocument(doc, targetCollection, addDocument, this.sidebarKey);
    removeDocument = (doc: Doc | Doc[]) => this.props.removeDocument(doc, this.sidebarKey);
    docFilters = () => [...StrListCast(this.props.layoutDoc._docFilters), ...StrListCast(this.props.layoutDoc[this.filtersKey])];

    sidebarStyleProvider = (doc: Opt<Doc>, props: Opt<FieldViewProps | DocumentViewProps>, property: string) => {
        if (property === StyleProp.ShowTitle) return StrCast(this.props.layoutDoc["sidebar-childShowTitle"], "title");
        return this.props.styleProvider?.(doc, props, property);
    }
    render() {
        const renderTag = (tag: string) => {
            const active = StrListCast(this.props.rootDoc[this.filtersKey]).includes(`${tag}:${tag}:check`);
            return <div key={tag} className={`sidebarAnnos-filterTag${active ? "-active" : ""}`}
                onClick={e => Doc.setDocFilter(this.props.rootDoc, tag, tag, "check", true, this.sidebarKey, e.shiftKey)}>
                {tag}
            </div>;
        };
        const renderUsers = (user: string) => {
            const active = StrListCast(this.props.rootDoc[this.filtersKey]).includes(`author:${user}:check`);
            return <div key={user} className={`sidebarAnnos-filterUser${active ? "-active" : ""}`}
                onClick={e => Doc.setDocFilter(this.props.rootDoc, "author", user, "check", true, this.sidebarKey, e.shiftKey)}>
                {user}
            </div>;
        };
        return !this.props.layoutDoc._showSidebar ? (null) :
            <div style={{
                position: "absolute", pointerEvents: this.props.isContentActive() ? "all" : undefined, top: 0, right: 0,
                background: this.props.styleProvider?.(this.props.rootDoc, this.props, StyleProp.WidgetColor),
                width: `${this.panelWidth()}px`,
                height: "100%"
            }}>
                <div className="sidebarAnnos-tagList" style={{ height: this.filtersHeight(), width: this.panelWidth() }}
                    onWheel={e => e.stopPropagation()}>
                    {this.allUsers.map(renderUsers)}
                    {this.allHashtags.map(renderTag)}
                </div>
                <div style={{ width: "100%", height: this.panelHeight(), position: "relative" }}>
                    <CollectionStackingView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit} ref={this._stackRef}
                        NativeWidth={returnZero}
                        NativeHeight={returnZero}
                        PanelHeight={this.panelHeight}
                        PanelWidth={this.panelWidth}
                        styleProvider={this.sidebarStyleProvider}
                        docFilters={this.docFilters}
                        scaleField={this.sidebarKey + "-scale"}
                        isAnnotationOverlay={false}
                        select={emptyFunction}
                        scaling={returnOne}
                        whenChildContentsActiveChanged={this.props.whenChildContentsActiveChanged}
                        childHideDecorationTitle={returnTrue}
                        removeDocument={this.removeDocument}
                        moveDocument={this.moveDocument}
                        addDocument={this.addDocument}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.screenToLocalTransform}
                        renderDepth={this.props.renderDepth + 1}
                        viewType={CollectionViewType.Stacking}
                        fieldKey={this.sidebarKey}
                        pointerEvents={"all"}
                    />
                </div>
            </div>;
    }
}
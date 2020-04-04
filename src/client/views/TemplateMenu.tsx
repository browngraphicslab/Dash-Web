import { action, observable, runInAction, ObservableSet, trace, computed } from "mobx";
import { observer } from "mobx-react";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template } from "./Templates";
import React = require("react");
import { Doc, DocListCast } from "../../new_fields/Doc";
import { Docs, } from "../documents/Documents";
import { StrCast, Cast } from "../../new_fields/Types";
import { CollectionTreeView } from "./collections/CollectionTreeView";
import { returnTrue, emptyFunction, returnFalse, returnOne, emptyPath } from "../../Utils";
import { Transform } from "../util/Transform";
import { ScriptField, ComputedField } from "../../new_fields/ScriptField";
import { Scripting } from "../util/Scripting";

@observer
class TemplateToggle extends React.Component<{ template: Template, checked: boolean, toggle: (event: React.ChangeEvent<HTMLInputElement>, template: Template) => void }> {
    render() {
        if (this.props.template) {
            return (
                <li className="templateToggle">
                    <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event, this.props.template)} />
                    {this.props.template.Name}
                </li>
            );
        } else {
            return (null);
        }
    }
}
@observer
class OtherToggle extends React.Component<{ checked: boolean, name: string, toggle: (event: React.ChangeEvent<HTMLInputElement>) => void }> {
    render() {
        return (
            <li className="chromeToggle">
                <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event)} />
                {this.props.name}
            </li>
        );
    }
}

export interface TemplateMenuProps {
    docViews: DocumentView[];
    templates: Map<Template, boolean>;
}


@observer
export class TemplateMenu extends React.Component<TemplateMenuProps> {
    _addedKeys = new ObservableSet();
    _customRef = React.createRef<HTMLInputElement>();
    @observable private _hidden: boolean = true;

    toggleLayout = (e: React.ChangeEvent<HTMLInputElement>, layout: string): void => {
        this.props.docViews.map(dv => dv.switchViews(e.target.checked, layout));
    }
    toggleDefault = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docViews.map(dv => dv.switchViews(false, "layout"));
    }

    toggleFloat = (e: React.ChangeEvent<HTMLInputElement>): void => {
        SelectionManager.DeselectAll();
        const topDocView = this.props.docViews[0];
        const ex = e.target.getBoundingClientRect().left;
        const ey = e.target.getBoundingClientRect().top;
        DocumentView.FloatDoc(topDocView, ex, ey);
    }

    toggleAudio = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docViews.map(dv => dv.props.Document._showAudio = e.target.checked);
    }

    @undoBatch
    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        this.props.docViews.forEach(d => Doc.Layout(d.Document)["_show" + template.Name] = event.target.checked ? template.Name.toLowerCase() : "");
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    @undoBatch
    @action
    toggleChrome = (): void => {
        this.props.docViews.map(dv => Doc.Layout(dv.Document)).forEach(layout =>
            layout._chromeStatus = (layout._chromeStatus !== "disabled" ? "disabled" : StrCast(layout._replacedChrome, "enabled")));
    }

    // todo: add brushes to brushMap to save with a style name
    onCustomKeypress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            runInAction(() => this._addedKeys.add(this._customRef.current!.value));
        }
    }
    componentDidMount() {
        !this._addedKeys && (this._addedKeys = new ObservableSet());
        Array.from(Object.keys(Doc.GetProto(this.props.docViews[0].props.Document))).
            filter(key => key.startsWith("layout_")).
            map(key => runInAction(() => this._addedKeys.add(key.replace("layout_", ""))));
    }

    return100 = () => 100;
    @computed get scriptField() {
        return ScriptField.MakeScript("switchView(firstDoc, this)", { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name, firstDoc: Doc.name },
            { firstDoc: this.props.docViews[0].props.Document });
    }
    render() {
        const firstDoc = this.props.docViews[0].props.Document;
        const templateName = StrCast(firstDoc.layoutKey, "layout").replace("layout_", "");
        const noteTypesDoc = Cast(Doc.UserDoc().noteTypes, Doc, null);
        const noteTypes = DocListCast(noteTypesDoc?.data);
        const addedTypes = DocListCast(Cast(Doc.UserDoc().templateButtons, Doc, null)?.data);
        const layout = Doc.Layout(firstDoc);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"audio"} name={"Audio"} checked={firstDoc._showAudio ? true : false} toggle={this.toggleAudio} />);
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={firstDoc.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        templateMenu.push(<OtherToggle key={"default"} name={"Default"} checked={templateName === "layout"} toggle={this.toggleDefault} />);
        if (noteTypesDoc) {
            addedTypes.concat(noteTypes).map(template => template.treeViewChecked = ComputedField.MakeFunction(`templateIsUsed(this, "${StrCast(firstDoc.title)}")`, { firstDoc: "string" }));
            this._addedKeys && Array.from(this._addedKeys).filter(key => !noteTypes.some(nt => nt.title === key)).forEach(template => templateMenu.push(
                <OtherToggle key={template} name={template} checked={templateName === template} toggle={e => this.toggleLayout(e, template)} />));
            templateMenu.push(
                <CollectionTreeView
                    Document={Doc.UserDoc().templateDocs as Doc}
                    CollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContainingCollectionView={undefined}
                    onCheckedClick={this.scriptField!}
                    onChildClick={this.scriptField!}
                    LibraryPath={emptyPath}
                    dropAction={undefined}
                    active={returnTrue}
                    ContentScaling={returnOne}
                    bringToFront={emptyFunction}
                    focus={emptyFunction}
                    whenActiveChanged={emptyFunction}
                    ScreenToLocalTransform={Transform.Identity}
                    isSelected={returnFalse}
                    pinToPres={emptyFunction}
                    select={emptyFunction}
                    renderDepth={1}
                    addDocTab={returnFalse}
                    PanelWidth={this.return100}
                    PanelHeight={this.return100}
                    treeViewHideHeaderFields={true}
                    annotationsKey={""}
                    dontRegisterView={true}
                    fieldKey={"data"}
                    moveDocument={(doc: Doc) => false}
                    removeDocument={(doc: Doc) => false}
                    addDocument={(doc: Doc) => false} />
            );
        }
        return <ul className="template-list" style={{ display: "block" }}>
            <input placeholder="+ layout" ref={this._customRef} onKeyPress={this.onCustomKeypress}></input>
            {templateMenu}
        </ul>;
    }
}

Scripting.addGlobal(function switchView(doc: Doc, template: Doc) {
    if (template.dragFactory) {
        template = Cast(template.dragFactory, Doc, null);
    }
    const templateTitle = StrCast(template?.title);
    return templateTitle && DocumentView.makeCustomViewClicked(doc, Docs.Create.FreeformDocument, templateTitle, template);
});

Scripting.addGlobal(function templateIsUsed(templateDoc: Doc, firstDocTitle: string) {
    const firstDoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0].props.Document : undefined;
    if (firstDoc) {
        const template = StrCast(templateDoc.dragFactory ? Cast(templateDoc.dragFactory, Doc, null)?.title : templateDoc.title);
        return StrCast(firstDoc.layoutKey) === "layout_" + template ? 'check' : 'unchecked';
    }
    return false;
    // return SelectionManager.SelectedDocuments().some(view => StrCast(view.props.Document.layoutKey) === "layout_" + template) ? 'check' : 'unchecked'
});
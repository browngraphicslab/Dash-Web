import { action, observable, runInAction, ObservableSet, trace, computed } from "mobx";
import { observer } from "mobx-react";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import React = require("react");
import { Doc, DocListCast } from "../../fields/Doc";
import { Docs, DocUtils, } from "../documents/Documents";
import { StrCast, Cast } from "../../fields/Types";
import { CollectionTreeView } from "./collections/CollectionTreeView";
import { returnTrue, emptyFunction, returnFalse, returnOne, emptyPath, returnZero, returnEmptyFilter, returnEmptyDoclist } from "../../Utils";
import { Transform } from "../util/Transform";
import { ScriptField, ComputedField } from "../../fields/ScriptField";
import { Scripting } from "../util/Scripting";
import { List } from "../../fields/List";
import { TraceMobx } from "../../fields/util";

@observer
class TemplateToggle extends React.Component<{ template: string, checked: boolean, toggle: (event: React.ChangeEvent<HTMLInputElement>, template: string) => void }> {
    render() {
        if (this.props.template) {
            return (
                <li className="templateToggle">
                    <input type="checkbox" checked={this.props.checked} onChange={(event) => this.props.toggle(event, this.props.template)} />
                    {this.props.template}
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
    templates: Map<string, boolean>;
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

    toggleAudio = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docViews.map(dv => dv.props.Document._showAudio = e.target.checked);
    }

    @undoBatch
    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: string): void => {
        this.props.docViews.forEach(d => Doc.Layout(d.layoutDoc)["_show" + template] = event.target.checked ? template.toLowerCase() : "");
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    @undoBatch
    @action
    toggleChrome = (): void => {
        this.props.docViews.map(dv => Doc.Layout(dv.layoutDoc)).forEach(layout =>
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
        const script = ScriptField.MakeScript("docs.map(d => switchView(d, this))", { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name, firstDoc: Doc.name },
            { docs: new List<Doc>(this.props.docViews.map(dv => dv.props.Document)) });
        return script ? () => script : undefined;
    }
    templateIsUsed = (selDoc: Doc, templateDoc: Doc) => {
        const template = StrCast(templateDoc.dragFactory ? Cast(templateDoc.dragFactory, Doc, null)?.title : templateDoc.title);
        return StrCast(selDoc.layoutKey) === "layout_" + template ? 'check' : 'unchecked';
    }
    render() {
        TraceMobx();
        const firstDoc = this.props.docViews[0].props.Document;
        const templateName = StrCast(firstDoc.layoutKey, "layout").replace("layout_", "");
        const noteTypes = DocListCast(Cast(Doc.UserDoc()["template-notes"], Doc, null)?.data);
        const addedTypes = Doc.UserDoc().noviceMode ? [] : DocListCast(Cast(Doc.UserDoc()["template-buttons"], Doc, null)?.data);
        const layout = Doc.Layout(firstDoc);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"audio"} name={"Audio"} checked={firstDoc._showAudio ? true : false} toggle={this.toggleAudio} />);
        templateMenu.push(<OtherToggle key={"default"} name={"Default"} checked={templateName === "layout"} toggle={this.toggleDefault} />);
        !Doc.UserDoc().noviceMode && templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        addedTypes.concat(noteTypes).map(template => template.treeViewChecked = this.templateIsUsed(firstDoc, template));
        this._addedKeys && Array.from(this._addedKeys).filter(key => !noteTypes.some(nt => nt.title === key)).forEach(template => templateMenu.push(
            <OtherToggle key={template} name={template} checked={templateName === template} toggle={e => this.toggleLayout(e, template)} />));
        return <ul className="template-list" style={{ display: "block" }}>
            {Doc.UserDoc().noviceMode ? (null) : <input placeholder="+ layout" ref={this._customRef} onKeyPress={this.onCustomKeypress} />}
            {templateMenu}
            {Doc.UserDoc().noviceMode ? (null) : <CollectionTreeView
                Document={Doc.UserDoc().templateDocs as Doc}
                CollectionView={undefined}
                ContainingCollectionDoc={undefined}
                ContainingCollectionView={undefined}
                docFilters={returnEmptyFilter}
                docRangeFilters={returnEmptyFilter}
                searchFilterDocs={returnEmptyDoclist}
                rootSelected={returnFalse}
                onCheckedClick={this.scriptField}
                onChildClick={this.scriptField}
                LibraryPath={emptyPath}
                dropAction={undefined}
                active={returnTrue}
                parentActive={returnFalse}
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
                moveDocument={returnFalse}
                removeDocument={returnFalse}
                addDocument={returnFalse} />}
        </ul>;
    }
}

Scripting.addGlobal(function switchView(doc: Doc, template: Doc | undefined) {
    if (template?.dragFactory) {
        template = Cast(template.dragFactory, Doc, null);
    }
    const templateTitle = StrCast(template?.title);
    return templateTitle && DocUtils.makeCustomViewClicked(doc, Docs.Create.FreeformDocument, templateTitle, template);
});

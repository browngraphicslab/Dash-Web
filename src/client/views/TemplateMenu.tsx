import { action, observable, runInAction, ObservableSet } from "mobx";
import { observer } from "mobx-react";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template } from "./Templates";
import React = require("react");
import { Doc, DocListCast } from "../../new_fields/Doc";
import { StrCast, Cast } from "../../new_fields/Types";
import { CurrentUserUtils } from "../../server/authentication/models/current_user_utils";

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
        this.props.docViews.map(dv => dv.switchViews(e.target.checked, layout));//.setCustomView(e.target.checked, layout));
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
        DocListCast(Cast(CurrentUserUtils.UserDocument.expandingButtons, Doc, null)?.data)?.map(btnDoc => {
            if (StrCast(Cast(btnDoc?.dragFactory, Doc, null)?.title)) {
                runInAction(() => this._addedKeys.add(StrCast(Cast(btnDoc?.dragFactory, Doc, null)?.title)));
            }
        });
    }

    render() {
        const layout = Doc.Layout(this.props.docViews[0].Document);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"audio"} name={"Audio"} checked={this.props.docViews[0].Document._showAudio ? true : false} toggle={this.toggleAudio} />);
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={this.props.docViews[0].Document.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        this._addedKeys && Array.from(this._addedKeys).map(layout =>
            templateMenu.push(<OtherToggle key={layout} name={layout} checked={StrCast(this.props.docViews[0].Document.layoutKey, "layout") === "layout_" + layout} toggle={e => this.toggleLayout(e, layout)} />)
        );
        return <ul className="template-list" style={{ display: "block" }}>
            {templateMenu}
            <input placeholder="+ layout" ref={this._customRef} onKeyPress={this.onCustomKeypress}></input>
        </ul>;
    }
}
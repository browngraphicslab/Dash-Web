import { action, observable } from "mobx";
import { observer } from "mobx-react";
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './TemplateMenu.scss';
import { DocumentView } from "./nodes/DocumentView";
import { Template, Templates } from "./Templates";
import React = require("react");
import { Doc } from "../../new_fields/Doc";
import { StrCast } from "../../new_fields/Types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

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
    docs: DocumentView[];
    templates: Map<Template, boolean>;
}


@observer
export class TemplateMenu extends React.Component<TemplateMenuProps> {
    @observable private _hidden: boolean = true;

    toggleCustom = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docs.map(dv => dv.setCustomView(e.target.checked));
    }
    toggleNarrative = (e: React.ChangeEvent<HTMLInputElement>): void => {
        this.props.docs.map(dv => dv.setNarrativeView(e.target.checked));
    }

    toggleFloat = (e: React.ChangeEvent<HTMLInputElement>): void => {
        SelectionManager.DeselectAll();
        const topDocView = this.props.docs[0];
        const ex = e.target.getBoundingClientRect().left;
        const ey = e.target.getBoundingClientRect().top;
        DocumentView.FloatDoc(topDocView, ex, ey);
    }


    @undoBatch
    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        if (event.target.checked) {
            this.props.docs.map(d => d.Document["show" + template.Name] = template.Name.toLowerCase());
        } else {
            this.props.docs.map(d => d.Document["show" + template.Name] = "");
        }
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    @undoBatch
    @action
    toggleChrome = (): void => {
        this.props.docs.map(dv => {
            const layout = Doc.Layout(dv.Document);
            layout._chromeStatus = (layout._chromeStatus !== "disabled" ? "disabled" : "enabled");
        });
    }

    render() {
        const layout = Doc.Layout(this.props.docs[0].Document);
        const templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));
        templateMenu.push(<OtherToggle key={"float"} name={"Float"} checked={this.props.docs[0].Document.z ? true : false} toggle={this.toggleFloat} />);
        templateMenu.push(<OtherToggle key={"custom"} name={"Custom"} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") !== "layout"} toggle={this.toggleCustom} />);
        templateMenu.push(<OtherToggle key={"narrative"} name={"Narrative"} checked={StrCast(this.props.docs[0].Document.layoutKey, "layout") === "layout_narrative"} toggle={this.toggleNarrative} />);
        templateMenu.push(<OtherToggle key={"chrome"} name={"Chrome"} checked={layout._chromeStatus !== "disabled"} toggle={this.toggleChrome} />);
        return <ul className="template-list" style={{ display: "block" }}>
            {templateMenu}
        </ul>;
    }
}
import { observable, computed, action, trace } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './DocumentDecorations.scss';
import { Template } from "./Templates";
import { DocumentView } from "./nodes/DocumentView";
import { List } from "../../new_fields/List";
import { Doc } from "../../new_fields/Doc";
import { NumCast } from "../../new_fields/Types";
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

export interface TemplateMenuProps {
    docs: DocumentView[];
    templates: Map<Template, boolean>;
}

@observer
export class TemplateMenu extends React.Component<TemplateMenuProps> {
    @observable private _hidden: boolean = true;

    constructor(props: TemplateMenuProps) {
        super(props);
    }

    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        if (event.target.checked) {
            if (template.Name == "Bullet") {
                let topDocView = this.props.docs[0];
                topDocView.addTemplate(template);
                topDocView.props.Document.subBulletDocs = new List<Doc>(this.props.docs.filter(v => v !== topDocView).map(v => v.props.Document.proto!));
            } else {
                this.props.docs.map(d => d.addTemplate(template));
            }
            this.props.templates.set(template, true);
        } else {
            if (template.Name == "Bullet") {
                let topDocView = this.props.docs[0];
                topDocView.removeTemplate(template);
                topDocView.props.Document.subBulletDocs = undefined;
            } else {
                this.props.docs.map(d => d.removeTemplate(template));
            }
            this.props.templates.set(template, false);
        }
    }

    @action
    componentWillReceiveProps(nextProps: TemplateMenuProps) {
        // this._templates = nextProps.templates;
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    render() {
        let templateMenu: Array<JSX.Element> = [];
        this.props.templates.forEach((checked, template) =>
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />));

        return (
            <div className="templating-menu" >
                <div className="templating-button" onClick={() => this.toggleTemplateActivity()}>+</div>
                <ul id="template-list" style={{ display: this._hidden ? "none" : "block" }}>
                    {templateMenu}
                </ul>
            </div>
        );
    }
}
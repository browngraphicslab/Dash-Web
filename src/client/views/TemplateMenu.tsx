import { observable, computed, action } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import './DocumentDecorations.scss';
import { Template } from "./Templates";
import { DocumentView } from "./nodes/DocumentView";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
class TemplateToggle extends React.Component<{ template: Template, checked: boolean, toggle: (event: React.ChangeEvent<HTMLInputElement>, template: Template) => void }> {
    render() {
        if (this.props.template) {
            return (
                <li>
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
    doc: DocumentView;
    templates: Map<Template, boolean>;
}

@observer
export class TemplateMenu extends React.Component<TemplateMenuProps> {

    @observable private _hidden: boolean = true;
    @observable private _templates: Map<Template, boolean> = this.props.templates;


    @action
    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        if (event.target.checked) {
            this.props.doc.addTemplate(template);
            this._templates.set(template, true);
        } else {
            this.props.doc.removeTemplate(template);
            this._templates.set(template, false);
        }
    }

    @action
    componentWillReceiveProps(nextProps: TemplateMenuProps) {
        this._templates = nextProps.templates;
    }

    @action
    toggleTemplateActivity = (): void => {
        this._hidden = !this._hidden;
    }

    render() {
        let templateMenu: Array<JSX.Element> = [];
        this._templates.forEach((checked, template) => {
            templateMenu.push(<TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />);
        });

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
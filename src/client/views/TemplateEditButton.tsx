import { observable, computed, action } from "mobx";
import React = require("react");
import { SelectionManager } from "../util/SelectionManager";
import { observer } from "mobx-react";
import './DocumentDecorations.scss'
import { Templates, Template } from "./Templates";
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
            )
        }
        return (null);
    }
}

export interface TemplateButtonProps {
    Document: DocumentView;
}

@observer
export class TemplateEditButton extends React.Component<TemplateButtonProps> {

    @observable private _templatesActive: boolean = false;
    @observable private _showBase: boolean = true;

    toggleTemplate = (event: React.ChangeEvent<HTMLInputElement>, template: Template): void => {
        let view = this.props.Document;
        if (event.target.checked) {
            view.addTemplate(template);
        } else {
            view.removeTemplate(template);
        }

        // const docs = view.props.ContainingCollectionView;
        // const docs = view.props.Document.GetList<Document>(view.props.fieldKey, []);

    }

    @action
    toggleBase = (event: React.ChangeEvent<HTMLInputElement>): void => {
        let view = this.props.Document;
        view.toggleBase(event.target.checked);
        this._showBase = !this._showBase;
    }

    @action
    toggleTemplateActivity = (): void => {
        this._templatesActive = !this._templatesActive;
    }

    render() {
        let templateMenu = !this._templatesActive ? (null) : (
            <ul id="template-list">
                <li><input type="checkbox" onChange={(event) => this.toggleBase(event)} defaultChecked={true} />Base layout</li>
                {console.log("mm")}
                {Array.from(Object.values(Templates)).map(template => {
                    let view = this.props.Document
                    let checked = view.hasTemplate(template);
                    return (
                        <TemplateToggle key={template.Name} template={template} checked={checked} toggle={this.toggleTemplate} />
                    )

                    // return (
                    //     <li key={template.Name}>
                    //         {console.log(template.Name, checked)}
                    //         <input type="checkbox" onChange={(event) => this.toggleTemplate(event, template)} defaultChecked={checked} />
                    //         {template.Name}
                    //     </li>
                    // )
                })}
            </ul>
        )
        return (
            <div className="templating-button-wrapper documentDecorations-ex-wrapper">
                <div className="templating-button documentDecorations-ex"
                    onClick={() => this.toggleTemplateActivity()}>T</div>
                {templateMenu}
            </div>
        )
    }
}
import React = require('react');
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as Autosuggest from 'react-autosuggest';
import { ObjectField } from '../../fields/ObjectField';
import { SchemaHeaderField } from '../../fields/SchemaHeaderField';
import { DragManager } from '../util/DragManager';
import "./EditableView.scss";

export interface EditableProps {
    /**
     * Called to get the initial value for editing
     *  */
    GetValue(): string | undefined;

    /**
     * Called to apply changes
     * @param value - The string entered by the user to set the value to
     * @returns `true` if setting the value was successful, `false` otherwise
     *  */
    SetValue(value: string, shiftDown?: boolean, enterKey?: boolean): boolean;

    OnFillDown?(value: string): void;

    OnTab?(shift?: boolean): void;
    OnEmpty?(): void;

    /**
     * The contents to render when not editing
     */
    contents: any;
    fontStyle?: string;
    fontSize?: number;
    height?: number | "auto";
    sizeToContent?: boolean;
    maxHeight?: number;
    display?: string;
    autosuggestProps?: {
        resetValue: () => void;
        value: string,
        onChange: (e: React.ChangeEvent, { newValue }: { newValue: string }) => void,
        autosuggestProps: Autosuggest.AutosuggestProps<string, any>

    };
    oneLine?: boolean;
    editing?: boolean;
    onClick?: (e: React.MouseEvent) => boolean;
    isEditingCallback?: (isEditing: boolean) => void;
    menuCallback?: (x: number, y: number) => void;
    textCallback?: (char: string) => boolean;
    showMenuOnLoad?: boolean;
    HeadingObject?: SchemaHeaderField | undefined;
    toggle?: () => void;
    color?: string | undefined;
    onDrop?: any;
    placeholder?: string;
}

/**
 * Customizable view that can be given an arbitrary view to render normally,
 * but can also be edited with customizable functions to get a string version
 * of the content, and set the value based on the entered string.
 */
@observer
export class EditableView extends React.Component<EditableProps> {
    @observable _editing: boolean = false;

    constructor(props: EditableProps) {
        super(props);
        this._editing = this.props.editing ? true : false;
    }

    // @action
    // componentDidUpdate(nextProps: EditableProps) {
    //     // this is done because when autosuggest is turned on, the suggestions are passed in as a prop,
    //     // so when the suggestions are passed in, and no editing prop is passed in, it used to set it
    //     // to false. this will no longer do so -syip
    //     if (nextProps.editing && nextProps.editing !== this._editing) {
    //         this._editing = nextProps.editing;
    //         EditableView.loadId = "";
    //     }
    // }

    @action
    componentDidMount() {
        if (this._ref.current && this.props.onDrop) {
            DragManager.MakeDropTarget(this._ref.current, this.props.onDrop.bind(this));
        }
    }
    @action
    componentWillUnmount() {
        this._inputref.current?.value && this.finalizeEdit(this._inputref.current.value, false, true, false)
    }

    _didShow = false;

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        switch (e.key) {
            case "Tab":
                e.stopPropagation();
                this.finalizeEdit(e.currentTarget.value, e.shiftKey, false, false);
                this.props.OnTab?.(e.shiftKey);
                break;
            case "Backspace":
                e.stopPropagation();
                if (!e.currentTarget.value) this.props.OnEmpty?.();
                break;
            case "Enter":
                e.stopPropagation();
                if (!e.ctrlKey) {
                    this.finalizeEdit(e.currentTarget.value, e.shiftKey, false, true);
                } else if (this.props.OnFillDown) {
                    this.props.OnFillDown(e.currentTarget.value);
                    this._editing = false;
                    this.props.isEditingCallback?.(false);
                }
                break;
            case "Escape":
                e.stopPropagation();
                this._editing = false;
                this.props.isEditingCallback?.(false);
                break;
            case ":":
                this.props.menuCallback?.(e.currentTarget.getBoundingClientRect().x, e.currentTarget.getBoundingClientRect().y);
                break;
            case "Shift": case "Alt": case "Meta": case "Control": break;
            default:
                if (this.props.textCallback?.(e.key)) {
                    this._editing = false;
                    this.props.isEditingCallback?.(false,);
                }
        }
    }

    @action
    onClick = (e: React.MouseEvent) => {
        e.nativeEvent.stopPropagation();
        if (this._ref.current && this.props.showMenuOnLoad) {
            this.props.menuCallback?.(this._ref.current.getBoundingClientRect().x, this._ref.current.getBoundingClientRect().y);
        } else if (!this.props.onClick?.(e)) {
            this._editing = true;
            this.props.isEditingCallback?.(true);
        }
        e.stopPropagation();
    }

    @action
    private finalizeEdit(value: string, shiftDown: boolean, lostFocus: boolean, enterKey: boolean) {
        if (this.props.SetValue(value, shiftDown, enterKey)) {
            this._editing = false;
            this.props.isEditingCallback?.(false,);
        } else {
            this._editing = false;
            this.props.isEditingCallback?.(false);
            !lostFocus && setTimeout(action(() => {
                this._editing = true;
                this.props.isEditingCallback?.(true);
            }), 0);
        }
    }

    stopPropagation(e: React.SyntheticEvent) {
        e.stopPropagation();
    }

    @action
    setIsFocused = (value: boolean) => {
        const wasFocused = this._editing;
        this._editing = value;
        return wasFocused !== this._editing;
    }

    _ref = React.createRef<HTMLDivElement>();
    _inputref = React.createRef<HTMLInputElement>();
    renderEditor() {
        return this.props.autosuggestProps
            ? <Autosuggest
                {...this.props.autosuggestProps.autosuggestProps}
                inputProps={{
                    className: "editableView-input",
                    onKeyDown: this.onKeyDown,
                    autoFocus: true,
                    onBlur: e => this.finalizeEdit(e.currentTarget.value, false, true, false),
                    onPointerDown: this.stopPropagation,
                    onClick: this.stopPropagation,
                    onPointerUp: this.stopPropagation,
                    onKeyPress: this.stopPropagation,
                    value: this.props.autosuggestProps.value,
                    onChange: this.props.autosuggestProps.onChange
                }}
            />
            : <input className="editableView-input" ref={this._inputref}
                defaultValue={this.props.GetValue()}
                onKeyDown={this.onKeyDown}
                autoFocus={true}
                onKeyPress={e => e.stopPropagation()}
                onBlur={e => this.finalizeEdit(e.currentTarget.value, false, true, false)}
                onPointerDown={this.stopPropagation} onClick={this.stopPropagation} onPointerUp={this.stopPropagation}
                style={{ display: this.props.display, fontSize: this.props.fontSize, minWidth: 20 }}
                placeholder={this.props.placeholder}
            />;
    }

    render() {
        if (this._editing && this.props.GetValue() !== undefined) {
            return this.props.sizeToContent ?
                <div style={{ display: "grid", minWidth: 100 }}>
                    <div style={{ display: "inline-block", position: "relative", height: 0, width: "100%", overflow: "hidden" }}>
                        {this.props.GetValue()}
                    </div>
                    {this.renderEditor()}
                </div> :
                this.renderEditor();
        }
        setTimeout(() => this.props.autosuggestProps?.resetValue(), 0);
        return this.props.contents instanceof ObjectField ? (null) :
            <div className={`editableView-container-editing${this.props.oneLine ? "-oneLine" : ""}`} ref={this._ref}
                style={{ display: this.props.display, minHeight: "17px", whiteSpace: "nowrap", height: this.props.height || "auto", maxHeight: this.props.maxHeight }}
                onClick={this.onClick} placeholder={this.props.placeholder}>
                <span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize }} >{
                    this.props.contents ? this.props.contents?.valueOf() : this.props.placeholder?.valueOf()}
                </span>
            </div>;
    }
}
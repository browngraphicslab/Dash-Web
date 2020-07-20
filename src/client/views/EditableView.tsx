import React = require('react');
import { action, observable } from 'mobx';
import { observer } from 'mobx-react';
import * as Autosuggest from 'react-autosuggest';
import { ObjectField } from '../../fields/ObjectField';
import { SchemaHeaderField } from '../../fields/SchemaHeaderField';
import "./EditableView.scss";
import { DragManager } from '../util/DragManager';
import { ComputedField } from '../../fields/ScriptField';
import { FieldValue } from '../../fields/Types';

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
    SetValue(value: string, shiftDown?: boolean): boolean;

    OnFillDown?(value: string): void;

    OnTab?(shift?: boolean): void;

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
    showMenuOnLoad?: boolean;
    HeadingObject?: SchemaHeaderField | undefined;
    toggle?: () => void;
    color?: string | undefined;
    onDrop?: any;
    placeholder?: string;
    highlight?: boolean;
    positions?: number[];
    search?: string;
    bing?: () => string|undefined;
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
    //     console.log("props editing = " + nextProps.editing);
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

    _didShow = false;

    @action
    onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Tab") {
            e.stopPropagation();
            this.finalizeEdit(e.currentTarget.value, e.shiftKey, false);
            this.props.OnTab && this.props.OnTab(e.shiftKey);
        } else if (e.key === "Enter") {
            e.stopPropagation();
            if (!e.ctrlKey) {
                this.finalizeEdit(e.currentTarget.value, e.shiftKey, false);
            } else if (this.props.OnFillDown) {
                this.props.OnFillDown(e.currentTarget.value);
                this._editing = false;
                this.props.isEditingCallback?.(false);
            }
        } else if (e.key === "Escape") {
            e.stopPropagation();
            this._editing = false;
            this.props.isEditingCallback?.(false);
        } else if (e.key === ":") {
            this.props.menuCallback?.(e.currentTarget.getBoundingClientRect().x, e.currentTarget.getBoundingClientRect().y);
        }
    }

    @action
    onClick = (e: React.MouseEvent) => {
        e.nativeEvent.stopPropagation();
        if (this._ref.current && this.props.showMenuOnLoad) {
            this.props.menuCallback?.(this._ref.current.getBoundingClientRect().x, this._ref.current.getBoundingClientRect().y);
        } else {
            if (!this.props.onClick?.(e)) {
                this._editing = true;
                this.props.isEditingCallback?.(true);
            }
        }
        e.stopPropagation();
    }

    @action
    private finalizeEdit(value: string, shiftDown: boolean, lostFocus: boolean) {
        if (this.props.SetValue(value, shiftDown)) {
            this._editing = false;
            this.props.isEditingCallback?.(false);
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
        //this._editing = value;
        return wasFocused !== this._editing;
    }

    _ref = React.createRef<HTMLDivElement>();
    renderEditor() {
        return this.props.autosuggestProps
            ? <Autosuggest
                {...this.props.autosuggestProps.autosuggestProps}
                inputProps={{
                    className: "editableView-input",
                    onKeyDown: this.onKeyDown,
                    autoFocus: true,
                    onBlur: e => this.finalizeEdit(e.currentTarget.value, false, true),
                    onPointerDown: this.stopPropagation,
                    onClick: this.stopPropagation,
                    onPointerUp: this.stopPropagation,
                    value: this.props.autosuggestProps.value,
                    onChange: this.props.autosuggestProps.onChange
                }}
            />
            : <input className="editableView-input"
                defaultValue={this.props.GetValue()}
                onKeyDown={this.onKeyDown}
                autoFocus={true}
                onBlur={e => this.finalizeEdit(e.currentTarget.value, false, true)}
                onPointerDown={this.stopPropagation} onClick={this.stopPropagation} onPointerUp={this.stopPropagation}
                style={{ display: this.props.display, fontSize: this.props.fontSize, minWidth: 20 }}
                placeholder={this.props.placeholder}
            />;
    }

    returnHighlights() {
        let results = [];
        let contents = this.props.bing!();

        if (contents!== undefined){
        if (this.props.positions!==undefined){
        let positions = this.props.positions;
        let length = this.props.search!.length;
        console.log(contents);
        console.log(this.props.contents?.valueOf());
        // contents = String(this.props.contents.valueOf());

        results.push(<span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize, color: this.props.contents ? "black" : "grey" }}>{contents ? contents.slice(0, this.props.positions![0]) : this.props.placeholder?.valueOf()}</span>);
        positions.forEach((num, cur) => {
            results.push(<span style={{ backgroundColor: "#FFFF00", fontStyle: this.props.fontStyle, fontSize: this.props.fontSize, color: this.props.contents ? "black" : "grey" }}>{contents ? contents.slice(num, num + length) : this.props.placeholder?.valueOf()}</span>);
            let end = 0;
            console.log
            cur === positions.length-1? end = contents.length: end = positions[cur + 1];
            results.push(<span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize, color: this.props.contents ? "black" : "grey" }}>{contents ? contents.slice(num + length, end) : this.props.placeholder?.valueOf()}</span>);
        }
        )
    }
        return results;
}
else{
    return <span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize, color: this.props.contents ? "black" : "grey" }}>{this.props.contents ? this.props.contents?.valueOf() : this.props.placeholder?.valueOf()}</span>;
}
    }

    render() {
        console.log(this.props.highlight === undefined);
        if (this._editing && this.props.GetValue() !== undefined) {
            return this.props.sizeToContent ?
                <div style={{ display: "grid", minWidth: 100 }}>
                    <div style={{ display: "inline-block", position: "relative", height: 0, width: "100%", overflow: "hidden" }}>{this.props.GetValue()}</div>
                    {this.renderEditor()}
                </div> : this.renderEditor();
        } else {
            this.props.autosuggestProps?.resetValue();
            return (this.props.contents instanceof ObjectField ? (null) :
                <div className={`editableView-container-editing${this.props.oneLine ? "-oneLine" : ""}`}
                    ref={this._ref}
                    style={{ display: this.props.display, minHeight: "20px", height: `${this.props.height ? this.props.height : "auto"}`, maxHeight: `${this.props.maxHeight}` }}
                    onClick={this.onClick} placeholder={this.props.placeholder}>
                    {this.props.highlight === undefined || this.props.positions===undefined || this.props.bing===undefined? <span style={{ fontStyle: this.props.fontStyle, fontSize: this.props.fontSize, color: this.props.contents ? "black" : "grey" }}>{this.props.contents ? this.props.contents?.valueOf() : this.props.placeholder?.valueOf()}</span>
                        : this.returnHighlights()}
                </div>
            );
        }
    }
}
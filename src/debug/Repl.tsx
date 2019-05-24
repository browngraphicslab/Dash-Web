import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { observer } from 'mobx-react';
import { observable, computed } from 'mobx';
import { CompileScript } from '../client/util/Scripting';

@observer
class Repl extends React.Component {
    @observable text: string = "";

    @observable executedCommands: { command: string, result: any }[] = [];

    onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.text = e.target.value;
    }

    onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            const script = CompileScript(this.text, { addReturn: true, typecheck: false });
            if (!script.compiled) {
                this.executedCommands.push({ command: this.text, result: "Compile Error" });
            } else {
                const result = script.run();
                if (result.success) {
                    this.executedCommands.push({ command: this.text, result: result.result });
                } else {
                    this.executedCommands.push({ command: this.text, result: result.error });
                }
            }
            this.text = "";
        }
    }

    @computed
    get commands() {
        return this.executedCommands.map(command => {
            return (
                <div style={{ marginTop: "5px" }}>
                    <p>{command.command}</p>
                    <p>{JSON.stringify(command.result)}</p>
                </div>
            );
        });
    }

    render() {
        return (
            <div>
                <div style={{ verticalAlign: "bottom" }}>
                    {this.commands}
                </div>
                <input style={{ width: "100%", position: "absolute", bottom: "0px" }} value={this.text} onChange={this.onChange} onKeyDown={this.onKeyDown} />
            </div>
        );
    }
}

ReactDOM.render(<Repl />, document.getElementById("root"));
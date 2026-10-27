// Aperture macros (%AM): parsing of the definition and evaluation into primitives.
// Reference: Gerber Layer Format Specification 2024.05 section 4.5; FlatCAM camlib.ApertureMacro.
// FlatCAM evaluates expressions with Python eval(); here a small recursive descent parser is used instead,
// so a file can never execute code.

export type Expression =
    | { kind: "number"; value: number }
    | { kind: "variable"; index: number }
    | { kind: "unary"; operator: "+" | "-"; operand: Expression }
    | { kind: "binary"; operator: "+" | "-" | "x" | "/"; left: Expression; right: Expression };

export type MacroStatement =
    | { kind: "primitive"; code: number; modifiers: Expression[] }
    | { kind: "assignment"; variable: number; expression: Expression };

export interface ApertureMacro
{
    name: string;
    statements: MacroStatement[];
}

/** Primitive with numeric modifiers, still in file units. */
export interface EvaluatedPrimitive
{
    code: number;
    modifiers: number[];
}

export class MacroSyntaxError extends Error
{
}

class ExpressionParser
{
    private mText: string;
    private mPosition: number;

    constructor(text: string)
    {
        this.mText = text;
        this.mPosition = 0;
    }

    public parse(): Expression
    {
        const expression = this.parseSum();
        if (this.mPosition < this.mText.length)
        {
            throw new MacroSyntaxError(`Unexpected '${this.mText[this.mPosition]}' in expression '${this.mText}'`);
        }
        return expression;
    }

    private peek(): string
    {
        return this.mText[this.mPosition] ?? "";
    }

    private parseSum(): Expression
    {
        let left = this.parseProduct();
        while (this.peek() === "+" || this.peek() === "-")
        {
            const operator = this.peek() as "+" | "-";
            this.mPosition++;
            left = { kind: "binary", operator, left, right: this.parseProduct() };
        }
        return left;
    }

    private parseProduct(): Expression
    {
        let left = this.parseUnary();
        while (this.peek() === "x" || this.peek() === "X" || this.peek() === "/")
        {
            const operator = this.peek() === "/" ? "/" : "x";
            this.mPosition++;
            left = { kind: "binary", operator, left, right: this.parseUnary() };
        }
        return left;
    }

    private parseUnary(): Expression
    {
        const sign = this.peek();
        if (sign === "+" || sign === "-")
        {
            this.mPosition++;
            return { kind: "unary", operator: sign, operand: this.parseUnary() };
        }
        return this.parseAtom();
    }

    private parseAtom(): Expression
    {
        const rest = this.mText.slice(this.mPosition);
        if (this.peek() === "(")
        {
            this.mPosition++;
            const inner = this.parseSum();
            if (this.peek() !== ")")
            {
                throw new MacroSyntaxError(`Missing ')' in expression '${this.mText}'`);
            }
            this.mPosition++;
            return inner;
        }
        const variable = /^\$(\d+)/.exec(rest);
        if (variable)
        {
            this.mPosition += variable[0].length;
            return { kind: "variable", index: Number(variable[1]) };
        }
        const number = /^(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
        if (number)
        {
            this.mPosition += number[0].length;
            return { kind: "number", value: Number(number[0]) };
        }
        throw new MacroSyntaxError(`Invalid expression '${this.mText}'`);
    }
}

export function parseExpression(text: string): Expression
{
    return new ExpressionParser(text).parse();
}

/** Evaluates an expression; undefined variables are 0 as in the specification. */
export function evaluateExpression(expression: Expression, variables: ReadonlyMap<number, number>): number
{
    switch (expression.kind)
    {
        case "number":
            return expression.value;
        case "variable":
            return variables.get(expression.index) ?? 0;
        case "unary":
        {
            const value = evaluateExpression(expression.operand, variables);
            return expression.operator === "-" ? -value : value;
        }
        case "binary":
        {
            const left = evaluateExpression(expression.left, variables);
            const right = evaluateExpression(expression.right, variables);
            switch (expression.operator)
            {
                case "+":
                    return left + right;
                case "-":
                    return left - right;
                case "x":
                    return left * right;
                case "/":
                    return right === 0 ? 0 : left / right;
            }
        }
    }
}

/**
 * Parses the blocks of a %AM command: blocks[0] is "AM<name>", the others are statements.
 * Throws MacroSyntaxError on invalid content.
 */
export function parseApertureMacro(blocks: readonly string[]): ApertureMacro
{
    const name = (blocks[0] ?? "").slice(2);
    if (name.length === 0)
    {
        throw new MacroSyntaxError("Aperture macro without a name");
    }
    const statements: MacroStatement[] = [];
    for (const block of blocks.slice(1))
    {
        if (block.length === 0 || /^0(?![\d.])/.test(block))
        {
            // Empty block or comment primitive "0 ..."
            continue;
        }
        const assignment = /^\$(\d+)=(.+)$/.exec(block);
        if (assignment)
        {
            statements.push({
                kind: "assignment",
                variable: Number(assignment[1]),
                expression: parseExpression(assignment[2] as string)
            });
            continue;
        }
        const fields = block.split(",");
        const code = Number(fields[0]);
        if (!Number.isInteger(code))
        {
            throw new MacroSyntaxError(`Invalid macro primitive '${block}'`);
        }
        statements.push({ kind: "primitive", code, modifiers: fields.slice(1).map(parseExpression) });
    }
    return { name, statements };
}

/** Runs the macro with the parameters of an %AD command ($1, $2, ...) and returns its primitives. */
export function evaluateApertureMacro(macro: ApertureMacro, parameters: readonly number[]): EvaluatedPrimitive[]
{
    const variables = new Map<number, number>();
    parameters.forEach((value, index) => variables.set(index + 1, value));
    const primitives: EvaluatedPrimitive[] = [];
    for (const statement of macro.statements)
    {
        if (statement.kind === "assignment")
        {
            variables.set(statement.variable, evaluateExpression(statement.expression, variables));
        }
        else
        {
            primitives.push({
                code: statement.code,
                modifiers: statement.modifiers.map((modifier) => evaluateExpression(modifier, variables))
            });
        }
    }
    return primitives;
}
